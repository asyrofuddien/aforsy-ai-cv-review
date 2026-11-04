const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { loadTs } = require('./helpers/load-ts.cjs');
const settlement = loadTs('src/features/billing/credit-settlement.ts');
const { planCreditSettlement } = settlement;

class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }

test('settlement reads real Mongoose allocation subdocuments without losing their lot IDs', () => {
  const { CreditReservation } = loadTs('src/models/billing.models.ts');
  const lotId = new mongoose.Types.ObjectId();
  const reservation = new CreditReservation({ userId: new mongoose.Types.ObjectId(), kind: 'ai_operation', referenceId: new mongoose.Types.ObjectId(), reservationKey: 'mongoose-fixture', totalCredits: 3, allocations: [{ lotId, credits: 3 }], status: 'held' });
  const plan = planCreditSettlement(reservation.allocations, 3, 1);
  assert.equal(String(plan[0].lotId), String(lotId));
  assert.equal(plan[0].credits, 3);
  assert.equal(plan[0].captured, 2);
  assert.equal(plan[0].released, 1);
});

test('a failed matching stage captures two credits and releases one to its original lot across all three-credit allocations', () => {
  for (const credits of [[3], [1, 2], [2, 1], [1, 1, 1]]) {
    const plan = planCreditSettlement(credits.map((n, i) => ({ lotId: `lot-${i}`, credits: n })), 3, 1);
    assert.equal(plan.reduce((sum, item) => sum + item.captured, 0), 2);
    assert.equal(plan.reduce((sum, item) => sum + item.released, 0), 1);
    assert.equal(plan.at(-1).released, 1, 'the last FIFO lot receives the unused matching credit');
    for (const item of plan) assert.equal(item.captured + item.released, item.credits);
  }
  assert.deepEqual(planCreditSettlement([{ lotId: 'retry', credits: 1 }], 1, 0), [{ lotId: 'retry', credits: 1, captured: 1, released: 0 }]);
  assert.deepEqual(planCreditSettlement([{ lotId: 'retry', credits: 1 }], 1, 1), [{ lotId: 'retry', credits: 1, captured: 0, released: 1 }]);
  assert.throws(() => planCreditSettlement([{ lotId: 'broken', credits: 2 }], 3, 1), /do not reconcile/);
  assert.throws(() => planCreditSettlement([{ lotId: 'broken', credits: 1 }], 1, 2), /do not reconcile/);
});

function billingFixture(action = 'cv_review_bundle', credits = [1, 2]) {
  const totalCredits = credits.reduce((a, b) => a + b, 0);
  const operation = { _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), status: 'running', action, stateVersion: 0, set(key, value) { this[key] = value; }, async save() {} };
  operation.id = String(operation._id);
  const reservation = { _id: new mongoose.Types.ObjectId(), reservationKey: 'fixture', totalCredits, status: 'held', allocations: credits.map(n => ({ lotId: new mongoose.Types.ObjectId(), credits: n })), set(key, value) { this[key] = value; }, async save() {} };
  const wallet = { availableCredits: 7, reservedCredits: totalCredits };
  const lots = new Map(reservation.allocations.map(item => [String(item.lotId), { available: 0, consumed: 0, reserved: item.credits }]));
  const ledger = [];
  const session = {};
  const apply = (target, update) => { for (const [key, value] of Object.entries(update.$inc)) target[key] = (target[key] || 0) + value; return { modifiedCount: 1 }; };
  const { billingService } = loadTs('src/features/billing/billing.service.ts', {
    '../../middlewares/error.middleware': { AppError },
    '../../models/adminAuditLog.model': {}, '../../models/user.model': {},
    './credit-settlement': settlement,
    '../../models/billing.models': {
      AiOperation: { findById: () => ({ session: async () => operation }) },
      CreditReservation: { findOne: () => ({ session: async () => reservation }) },
      BillingWallet: { updateOne: async (_filter, update, options) => { assert.equal(options.session, session); return apply(wallet, update); } },
      CreditLot: { updateOne: async (filter, update, options) => { assert.equal(options.session, session); return apply(lots.get(String(filter._id)), update); } },
      CreditLedger: { create: async entries => ledger.push(...entries) },
      IdempotencyRecord: { updateOne: async () => {} },
    },
  });
  return { billingService, operation, reservation, wallet, lots, ledger, session };
}

test('partial bundle settlement preserves balances and ledger amounts, and replay cannot capture or refund twice', async () => {
  const f = billingFixture();
  assert.equal((await f.billingService.settleCreditOperation(f.operation.id, 'partial', 'matching_failed_final', f.session)).settled, true);
  assert.equal(f.operation.status, 'completed_partial');
  assert.equal(f.reservation.status, 'partially_captured');
  assert.equal(f.reservation.capturedCredits, 2);
  assert.equal(f.reservation.releasedCredits, 1);
  assert.equal(f.wallet.availableCredits, 8);
  assert.equal(f.wallet.reservedCredits, 0);
  assert.equal(f.ledger.filter(e => e.eventType === 'capture_ai').reduce((s, e) => s + e.deltaConsumed, 0), 2);
  assert.equal(f.ledger.filter(e => e.eventType === 'release_ai').reduce((s, e) => s + e.deltaAvailable, 0), 1);
  assert.equal(f.ledger.reduce((s, e) => s + e.deltaReserved, 0), -3);
  const entries = f.ledger.length;
  assert.equal((await f.billingService.settleCreditOperation(f.operation.id, 'partial', 'matching_failed_final', f.session)).settled, false);
  assert.equal(f.ledger.length, entries);
  await assert.rejects(f.billingService.settleCreditOperation(f.operation.id, 'release', 'late_worker', f.session), /different terminal state/);
});

test('matching retry charges exactly one credit on success and returns it on terminal failure', async () => {
  for (const outcome of ['capture', 'release']) {
    const f = billingFixture('job_match_retry', [1]);
    await f.billingService.settleCreditOperation(f.operation.id, outcome, 'retry_finished', f.session);
    assert.equal(f.wallet.availableCredits, outcome === 'release' ? 8 : 7);
    assert.equal(f.wallet.reservedCredits, 0);
    assert.equal(f.reservation.capturedCredits, outcome === 'capture' ? 1 : 0);
    assert.equal(f.reservation.releasedCredits, outcome === 'release' ? 1 : 0);
    assert.equal((await f.billingService.settleCreditOperation(f.operation.id, outcome, 'retry_finished', f.session)).settled, false);
  }
  const f = billingFixture('job_match_retry', [1]);
  await assert.rejects(f.billingService.settleCreditOperation(f.operation.id, 'partial', 'retry_failed', f.session), /completed CV review bundle/);
  assert.equal(f.wallet.reservedCredits, 1);
});
