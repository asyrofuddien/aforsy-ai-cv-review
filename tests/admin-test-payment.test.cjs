const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { loadTs } = require('./helpers/load-ts.cjs');
class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }

function fixture({ enabled = true, failGrant = false, paymentStatus = 'pending' } = {}) {
  const actorId = String(new mongoose.Types.ObjectId());
  const userId = new mongoose.Types.ObjectId();
  const order = { _id: new mongoose.Types.ObjectId(), userId, paymentStatus, fulfillmentStatus: 'pending', isTestPayment: false, packageSnapshot: { credits: 12 }, async save(options) { assert.equal(options.session, session); } };
  const calls = { grants: [], email: [], audit: [] };
  const session = {
    async withTransaction(work) { const before = { ...order }; try { return await work(); } catch (error) { Object.assign(order, before); throw error; } },
    async endSession() {},
  };
  const { markTestPaymentPaid } = loadTs('src/features/billing/testing/admin-test-payment.service.ts', {
    mongoose: { ...mongoose, startSession: async () => session },
    '../../../config/config': { billing: { adminTestPaymentsEnabled: enabled } },
    '../../../middlewares/error.middleware': { AppError },
    '../../../models/billing.models': {
      PaymentOrder: { findById: () => ({ session: async actual => { assert.equal(actual, session); return order; } }) },
      OutboxEvent: { updateOne: async (filter, update, options) => { assert.equal(options.session, session); calls.email.push({ filter, update }); } },
    },
    '../../../models/user.model': { findOne: () => ({ session: async actual => { assert.equal(actual, session); return { _id: userId }; } }) },
    '../../../models/adminAuditLog.model': { create: async (entries, options) => { assert.equal(options.session, session); calls.audit.push(...entries); } },
    '../billing.service': { grantInTransaction: async input => { assert.equal(input.session, session); if (failGrant) throw new Error('grant failed'); calls.grants.push(input); } },
  });
  return { mark: () => markTestPaymentPaid(String(order._id), actorId, 'Validate paid credit grant'), markTestPaymentPaid, order, calls, actorId };
}

test('admin paid simulation uses the purchase grant once, persists a test marker, and enqueues the real receipt', async () => {
  const f = fixture();
  assert.equal((await f.mark()).reused, false);
  assert.equal(f.order.paymentStatus, 'paid');
  assert.equal(f.order.fulfillmentStatus, 'granted');
  assert.equal(f.order.confirmedPaidAmountIdr, 0);
  assert.equal(f.order.isTestPayment, true);
  assert.equal(f.calls.grants[0].amount, 12);
  assert.equal(f.calls.grants[0].grantKey, `grant:order:${f.order._id}`);
  assert.equal(f.calls.grants[0].sourceType, 'purchase');
  assert.equal(f.calls.grants[0].actorType, 'admin');
  assert.equal(f.calls.email[0].update.$setOnInsert.type, 'email.purchase_receipt');
  assert.equal(f.calls.audit[0].actorUserId, f.actorId);
  assert.equal((await f.mark()).reused, true);
  assert.equal(f.calls.grants.length, 1);
  assert.equal(f.calls.email.length, 1);
  assert.equal(f.calls.audit.length, 1);
});

test('disabling the temporary tool or selecting an already paid real order cannot grant credits', async () => {
  const disabled = fixture({ enabled: false });
  await assert.rejects(disabled.mark(), error => error.statusCode === 403);
  assert.equal(disabled.calls.grants.length, 0);
  const paid = fixture({ paymentStatus: 'paid' });
  await assert.rejects(paid.mark(), error => error.statusCode === 409);
  assert.equal(paid.calls.grants.length, 0);
});

test('a failed grant aborts the transaction without leaving a paid order or sending a receipt', async () => {
  const f = fixture({ failGrant: true });
  await assert.rejects(f.mark(), /grant failed/);
  assert.equal(f.order.paymentStatus, 'pending');
  assert.equal(f.order.isTestPayment, false);
  assert.equal(f.calls.email.length, 0);
  assert.equal(f.calls.audit.length, 0);
});

test('a test purchase receipt preserves zero cash received instead of substituting the package price', async () => {
  let receipt;
  const { deliverBillingEmail } = loadTs('src/features/billing/notifications/email.sender.ts', {
    '../../../models/billing.models': { PaymentOrder: { findById: () => ({ lean: async () => ({ _id: 'test-order', userId: 'owner', isTestPayment: true, locale: 'id', confirmedPaidAmountIdr: 0, publicOrderNumber: 'TEST-ORDER', packageSnapshot: { amountIdr: 14000, credits: 12, nameId: 'Mulai' } }) }) } },
    '../../../models/user.model': { findById: () => ({ select() { return this; }, lean: async () => ({ email: 'fixture@example.test', displayName: 'Fixture' }) }) },
    '../../auth/email.adapter': { sendPurchaseReceiptEmail: async input => { receipt = input; } },
    '../../../models/evaluation.model': {},
  });
  await deliverBillingEmail({ type: 'email.purchase_receipt', entityId: 'test-order' });
  assert.equal(receipt.isTestPayment, true);
  assert.equal(receipt.amountIdr, 0);
  assert.equal(receipt.credits, 12);
});

test('test order credits cannot create a cash refund request', async () => {
  const { invoke } = require('./helpers/load-ts.cjs');
  const { billingController } = loadTs('src/features/billing/billing.controller.ts', {
    '../../middlewares/error.middleware': { AppError, asyncHandler: fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next) },
    './billing.service': {}, './orders/order.service': {},
    '../../models/billing.models': { PaymentOrder: { findById: async () => ({ userId: 'owner', paymentStatus: 'paid', fulfillmentStatus: 'granted', isTestPayment: true }) } },
    '../../models/user.model': {}, '../../models/adminAuditLog.model': {}, '../../models/aiUsage.model': {}, '../../models/evaluation.model': {}, '../../utils/locale': {},
  });
  await assert.rejects(invoke(billingController.refundRequest, { params: { orderId: String(new mongoose.Types.ObjectId()) }, body: { reasonCode: 'test_refund' }, authUser: { userId: 'admin' } }), error => error.statusCode === 409);
});
