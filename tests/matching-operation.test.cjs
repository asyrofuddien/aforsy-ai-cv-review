const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { loadTs, invoke } = require('./helpers/load-ts.cjs');
class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }

function fixture(action = 'cv_review_bundle', status = 'running', matchingStatus = 'failed') {
  const op = { _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), resourceId: new mongoose.Types.ObjectId(), status, action, workerToken: 'owner', stateVersion: 0, locale: 'id', set(key, value) { this[key] = value; }, async save() {} };
  op.id = String(op._id);
  const session = { async withTransaction(work) { return work(); }, async endSession() {} };
  const calls = { billing: [], updates: [], results: [], outbox: [] };
  let modifiedCount = 1;
  const { operationService } = loadTs('src/features/ai-operations/operation.service.ts', {
    mongoose: { ...mongoose, startSession: async () => session },
    '../../middlewares/error.middleware': { AppError },
    '../../models/billing.models': {
      AiOperation: { findById: () => ({ session: async () => op }) },
      AiOperationResult: { findOneAndUpdate: async (_filter, update, options) => { assert.equal(options.session, session); calls.results.push(update); return { _id: new mongoose.Types.ObjectId() }; } },
      OutboxEvent: { updateOne: async (_filter, update, options) => { assert.equal(options.session, session); calls.outbox.push(update); } },
    },
    '../billing/billing.service': { billingService: { settleCreditOperation: async (...args) => { assert.equal(args[3], session); calls.billing.push(args); } } },
    '../../models/evaluation.model': {
      findOne: filter => ({ session: async actual => { assert.equal(actual, session); assert.equal(filter.userId, op.userId); return { status: 'completed', result: { jobMatchingStatus: matchingStatus } }; } }),
      updateOne: async (filter, update, options) => { assert.equal(options.session, session); if (action === 'job_match_retry') assert.equal(String(filter.matchingRetryOperationId), op.id); assert.equal(filter.userId, op.userId); calls.updates.push(update); return { modifiedCount }; },
    },
  });
  return { op, calls, operationService, loseClaim: () => { modifiedCount = 0; } };
}

test('partial review settlement is fenced and durable; duplicate finalization cannot charge or refund twice', async () => {
  const f = fixture();
  await assert.rejects(f.operationService.savePartialAndSettle(f.op.id, 'matching_failed_final', { evaluationId: String(f.op.resourceId) }, 'stale'), /lease was lost/);
  assert.equal(f.calls.billing.length, 0);
  await f.operationService.savePartialAndSettle(f.op.id, 'matching_failed_final', { evaluationId: String(f.op.resourceId) }, 'owner');
  assert.equal(f.op.status, 'completed_partial');
  assert.equal(f.calls.billing[0][1], 'partial');
  assert.equal(f.calls.results[0].$setOnInsert.resultData.evaluationId, String(f.op.resourceId));
  await f.operationService.savePartialAndSettle(f.op.id, 'matching_failed_final', {}, 'owner');
  assert.equal(f.calls.billing.length, 1);
  assert.equal(f.calls.outbox.length, 0);
});

test('a last-attempt crash after saving a partial review still returns only one matching credit', async () => {
  const f = fixture('cv_review_bundle', 'queued');
  await f.operationService.releaseTerminal(f.op.id, 'lease_expired_final');
  assert.equal(f.op.status, 'completed_partial');
  assert.equal(f.calls.billing.length, 1);
  assert.equal(f.calls.billing[0][1], 'partial');
});

test('terminal recovery charges review only when matching is still processing', async () => {
  const f = fixture('cv_review_bundle', 'queued', 'processing');
  await f.operationService.releaseTerminal(f.op.id, 'lease_expired_final');
  assert.equal(f.op.status, 'completed_partial');
  assert.equal(f.calls.billing[0][1], 'partial');
  assert.equal(f.calls.updates[0].$set['result.jobMatchingStatus'], 'failed');
});

test('terminal recovery captures the full bundle after matching was saved', async () => {
  const f = fixture('cv_review_bundle', 'queued', 'completed');
  await f.operationService.releaseTerminal(f.op.id, 'lease_expired_final');
  assert.equal(f.op.status, 'completed');
  assert.equal(f.calls.billing[0][1], 'capture');
});

test('a successful matching-only retry saves matching and captures in the same transaction, including valid zero matches', async () => {
  const f = fixture('job_match_retry');
  await f.operationService.saveResultAndCapture(f.op.id, { evaluationId: String(f.op.resourceId), matching: { suggestedRoles: ['Analyst'], jobs: [] } }, 'owner');
  assert.equal(f.op.status, 'completed');
  assert.equal(f.calls.billing[0][1], 'capture');
  assert.deepEqual(Object.keys(f.calls.updates[0].$set).sort(), ['result.jobMatches', 'result.jobMatchingStatus', 'result.suggestedRoles']);
  assert.equal(f.calls.updates[0].$set['result.jobMatchingStatus'], 'completed');
  assert.equal(f.calls.updates[0].$unset.matchingRetryOperationId, 1);
  await f.operationService.saveResultAndCapture(f.op.id, {}, 'owner');
  assert.equal(f.calls.billing.length, 1);
});

test('a retry that lost the review claim cannot overwrite matching or capture its credit', async () => {
  const f = fixture('job_match_retry');
  f.loseClaim();
  await assert.rejects(f.operationService.saveResultAndCapture(f.op.id, { matching: { suggestedRoles: [], jobs: [] } }, 'owner'), /no longer owns/);
  assert.equal(f.calls.billing.length, 0);
});

test('terminal matching retry failure releases the credit and clears only its own active claim', async () => {
  const f = fixture('job_match_retry');
  await f.operationService.releaseTerminal(f.op.id, 'operation_failed_final', 'owner');
  assert.equal(f.op.status, 'failed');
  assert.equal(f.calls.billing[0][1], 'release');
  assert.deepEqual(f.calls.updates[0], { $unset: { matchingRetryOperationId: 1 } });
  await f.operationService.releaseTerminal(f.op.id, 'operation_failed_final', 'owner');
  assert.equal(f.calls.billing.length, 1);
});

test('retry endpoint rejects another user before creating a credit operation', async () => {
  let creates = 0;
  const { retryJobMatching } = loadTs('src/features/review/matching-retry.controller.ts', {
    '../../middlewares/error.middleware': { AppError, asyncHandler: fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next) },
    '../../models/evaluation.model': { findOne: filter => { assert.equal(filter.userId, 'other-account'); return { select: async () => null }; } },
    '../../models/document.model': {},
    '../ai-operations/operation.service': { operationService: { createAndReserve: async () => { creates++; } } },
  });
  await assert.rejects(invoke(retryJobMatching, { params: { id: String(new mongoose.Types.ObjectId()) }, authUser: { userId: 'other-account' } }), error => error.statusCode === 404);
  assert.equal(creates, 0);
});

test('invalid AI role suggestions fail matching instead of substituting unrelated software jobs', async () => {
  const { logger } = require('./helpers/load-ts.cjs');
  const jsonResponse = loadTs('src/services/llm/json-response.ts', { '../../utils/logger': logger });
  for (const response of ['{"suggested_roles":[]}', '{"suggested_roles":[""]}', '{"suggested_roles":']) {
    const { MatcherAIService } = loadTs('src/features/cv-matcher/matcher.ai.ts', {
      '../../utils/logger': logger,
      './matcher.prompts': { MATCHER_PROMPTS: { ROLE_SUGGESTION: { system: 'Suggest roles grounded in this CV', user: () => 'source' } } },
      '../../services/llm/json-response': jsonResponse,
      '../../services/llm/openai.service': { completion: async () => response },
    });
    await assert.rejects(new MatcherAIService().RoleSuggestion({ name: 'Finance Candidate' }));
  }
});
