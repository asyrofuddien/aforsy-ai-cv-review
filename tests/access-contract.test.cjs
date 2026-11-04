const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { loadTs, logger } = require('./helpers/load-ts.cjs');
const { AppError, asyncHandler, errorMiddleware } = loadTs('src/middlewares/error.middleware.ts', { '../utils/logger': { ...logger, log() {} } });
const cvId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const resultId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function fixture() {
  const calls = { enqueued: [], revoked: [] };
  const authService = loadTs('src/services/auth.service.ts', {
    '../models/authSession.model': {}, '../models/emailToken.model': {}, '../models/user.model': {},
    '../config/config': { auth: {} }, './email.service': { sendAuthEmail: async () => {} },
    '../features/auth/credentials.crypto': {
      hashOpaqueToken: value => require('node:crypto').createHash('sha256').update(value).digest('hex'),
      hashPassword: async value => value,
      verifyPassword: async () => false,
    },
    '../features/auth/email-actions.service': { createEmailAction: async () => {}, consumeEmailAction: async () => null },
    '../features/auth/auth.service': {
      hashOpaqueToken: value => require('node:crypto').createHash('sha256').update(value).digest('hex'),
      sessionCookieName: 'landly_session', csrfHeaderName: 'x-csrf-token',
      getCookie: (header, name) => header?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1),
      verifyCsrf: (provided, expected) => !!provided && require('node:crypto').createHash('sha256').update(provided).digest('hex') === expected,
    },
  });
  const users = [
    { id: 'owner-a', role: 'user', isActive: true },
    { id: 'owner-b', role: 'user', isActive: true },
    { id: 'admin', role: 'admin', isActive: true },
    { id: 'inactive', role: 'user', isActive: false },
  ];
  const sessions = [...users.map(user => ({ id: `session-${user.id}`, userId: user.id, tokenHash: authService.hashOpaqueToken(user.id), csrfHash: authService.hashOpaqueToken('synthetic-csrf'), expiresAt: new Date(Date.now() + 60000), createdAt: new Date() })),
    { id: 'expired', userId: 'owner-a', tokenHash: authService.hashOpaqueToken('expired'), expiresAt: new Date(0) }];
  const { authenticate, requireAdmin } = loadTs('src/middlewares/auth.middleware.ts', {
    '../services/auth.service': authService,
    './error.middleware': { AppError },
    '../models/authSession.model': {
      findOne: query => ({ select: async () => sessions.find(s => s.tokenHash === query.tokenHash && (!query.expiresAt || s.expiresAt > query.expiresAt.$gt)) || null }),
      deleteMany: async query => { calls.revoked.push(query.userId); },
    },
    '../models/user.model': { findById: async id => users.find(u => u.id === id) },
  });
  const result = { id: resultId, _id: resultId, userId: 'owner-a', candidateName: 'Synthetic A', status: 'completed', result: { cvMatchRate: 65, mode: 'general', cvFeedback: 'Synthetic feedback' } };
  const model = {
    findOne: async query => Object.entries(query).every(([key, value]) => result[key] === value) ? result : null,
    find: query => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, select: async () => query.userId === 'owner-a' ? [result] : [] }),
    aggregate: async () => [{ _id: 'completed', count: 1 }],
    countDocuments: async query => query.userId === 'owner-a' ? 1 : 0,
  };
  const queue = { addEvaluationJob: async (data, userId) => { calls.enqueued.push({ data, userId }); return { id: 'synthetic-job', jobId: 'synthetic-job' }; }, getJobCounts: async () => ({ waiting: 3, active: 2, completed: 7, failed: 1 }) };
  const validation = loadTs('src/middlewares/validation.middleware.ts', { './error.middleware': { AppError } });
  const controller = loadTs('src/controllers/evaluation.controller.ts', {
    '../utils/logger': logger, '../utils/locale': { requestLocale: () => 'id' },
    '../utils/constants': { ERROR_MESSAGES: { EVALUATION_NOT_FOUND: 'Not found' } },
    '../middlewares/error.middleware': { AppError, asyncHandler },
    '../services/queue.service': queue,
    '../models/jobDescription.model': { exists: async () => true },
    '../models/evaluation.model': model, '../models/cvMatcher.model': { aggregate: async () => [{ _id: 'queued', count: 2 }] },
    '../models/document.model': { findOne: async query => query._id === cvId && query.userId === 'owner-a' ? { id: cvId } : null },
  }).default;
  const evaluationRoutes = loadTs('src/routes/evaluation.routes.ts', {
    '../controllers/evaluation.controller': controller,
    '../middlewares/validation.middleware': validation,
  }).default;
  const adminController = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : (_req, res) => res.json({ success: true }) });
  const adminRoutes = loadTs('src/routes/admin.routes.ts', {
    '../controllers/admin.controller': adminController,
    '../features/billing/billing.controller': { billingController: { goodwill: (_req, res) => res.status(201).json({ success: true }) } },
    '../middlewares/auth.middleware': { requireAdmin },
  }).default;
  const billingServiceStub = {
    getActiveCatalog: async () => ({ packages: [], actionCosts: [] }),
    getWallet: async () => ({ wallet: { availableCredits: 0, reservedCredits: 0, billingRiskHold: false, version: 0 }, lots: {}, ledger: {}, consistent: true }),
    listLedger: async () => ({ records: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  };
  const billingControllerReal = loadTs('src/features/billing/billing.controller.ts', {
    '../../middlewares/error.middleware': { AppError, asyncHandler },
    './billing.service': { billingService: billingServiceStub },
  });
  const billingRoutes = loadTs('src/features/billing/billing.routes.ts', {
    '../../middlewares/auth.middleware': { authenticate },
    './billing.controller': billingControllerReal,
  }).default;
  const routes = loadTs('src/routes/index.ts', {
    './auth.routes': express.Router(), './upload.routes': express.Router(),
    './document.routes': express.Router(),
    './evaluation.routes': evaluationRoutes, './jobDescription.routes': express.Router(),
    '../routes/cvGenerator.routes': express.Router(), './admin.routes': adminRoutes,
    '../features/billing/billing.routes': { __esModule: true, default: billingRoutes },
    '../middlewares/auth.middleware': { authenticate, requireAdmin },
    '../controllers/dashboard.controller': { dashboardSummary: (_req, res) => res.json({ success: true }) },
    './system.routes': loadTs('src/routes/system.routes.ts', {
      '../services/mongo-transaction-readiness': { probeMongoTransactions: async () => false },
      '../middlewares/error.middleware': { asyncHandler },
    }).default,
    './reporting.routes': express.Router().get('/recent-evaluations', (_req, res) => res.json({ success: true, evaluations: [result] })),
    '../models/document.model': {}, '../models/evaluation.model': model,
    '../models/jobDescription.model': {}, '../models/code.model': {}, '../models/cvMatcher.model': {},
    '../models/atsPDF.model': {}, '../models/Template.model': {}, '../services/queue.service': queue,
  }).default;
  const app = express();
  app.use(express.json()); app.use('/api', routes); app.use(errorMiddleware);
  return { app, calls };
}

async function withServer(t, run) {
  const setup = fixture();
  const server = setup.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const request = async (path, { owner, method = 'GET', body, csrf } = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { ...(owner ? { cookie: `landly_session=${owner}` } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json() };
  };
  await run(request, setup.calls);
}

test('public API info stays public; product data requires an active unexpired account', async t => {
  await withServer(t, async (request, calls) => {
    assert.equal((await request('/test')).status, 200);
    const transactionHealth = await request('/health/transactions');
    assert.equal(transactionHealth.status, 503);
    assert.equal(transactionHealth.body.status, 'unavailable');
    assert.equal((await request(`/evaluate/${resultId}`)).status, 401);
    assert.equal((await request(`/evaluate/${resultId}`, { owner: 'expired' })).status, 401);
    assert.equal((await request(`/evaluate/${resultId}`, { owner: 'inactive' })).status, 403);
    assert.deepEqual(calls.revoked, ['inactive']);
  });
});

test('owner data is isolated and admin/statistics guards remain in the mounted routes', async t => {
  await withServer(t, async request => {
    const own = await request(`/evaluate/${resultId}`, { owner: 'owner-a' });
    assert.equal(own.status, 200); assert.equal(own.body.result.cv_match_rate, 65);
    assert.equal((await request(`/evaluate/${resultId}`, { owner: 'owner-b' })).status, 404);
    assert.equal((await request('/test/recent-evaluations', { owner: 'owner-a' })).status, 403);
    assert.equal((await request('/test/recent-evaluations', { owner: 'admin' })).status, 200);
    assert.equal((await request('/admin/summary', { owner: 'owner-a' })).status, 403);
    assert.equal((await request('/admin/summary', { owner: 'admin' })).status, 200);
  });
});

test('review mutation validates CSRF, document owner and conflicting JD before enqueue', async t => {
  await withServer(t, async (request, calls) => {
    const body = { cvDocumentId: cvId };
    const options = { method: 'POST', owner: 'owner-a', body };
    assert.equal((await request('/evaluate', options)).status, 403);
    assert.equal((await request('/evaluate', { ...options, csrf: 'wrong' })).status, 403);
    assert.equal((await request('/evaluate', { ...options, owner: 'owner-b', csrf: 'synthetic-csrf' })).status, 404);
    assert.equal((await request('/evaluate', { ...options, csrf: 'synthetic-csrf', body: { ...body, jobDescriptionId: resultId, jobDescriptionText: 'Conflicting job' } })).status, 400);
    for (const jobDescriptionText of [{ invalid: true }, 'x'.repeat(20001)]) {
      assert.equal((await request('/evaluate', { ...options, csrf: 'synthetic-csrf', body: { ...body, jobDescriptionText } })).status, 400);
    }
    assert.equal(calls.enqueued.length, 0);
    const accepted = await request('/evaluate', { ...options, csrf: 'synthetic-csrf', body: { ...body, jobDescriptionText: '   ' } });
    assert.equal(accepted.status, 202);
    assert.deepEqual(accepted.body, { id: 'synthetic-job', status: 'queued' });
    assert.equal(calls.enqueued[0].userId, 'owner-a');
    assert.equal(calls.enqueued[0].data.jobDescriptionText, undefined);
    assert.equal(calls.enqueued[0].data.locale, 'id');
  });
});

test('queue status is authenticated and scoped for users while admins see operational counts', async t => {
  await withServer(t, async request => {
    assert.equal((await request('/evaluate/queue-status')).status, 401);
    const user = await request('/evaluate/queue-status', { owner: 'owner-a' });
    assert.deepEqual(user.body.data, { waiting: 2, active: 0, completed: 1, failed: 0, delayed: 0, paused: 0 });
    const admin = await request('/evaluate/queue-status', { owner: 'admin' });
    assert.deepEqual(admin.body.data, { waiting: 3, active: 2, completed: 7, failed: 1, delayed: 0, paused: 0 });
  });
});

test('review history is paginated and filters by authenticated owner', async t => {
  await withServer(t, async request => {
    assert.equal((await request('/evaluate/history')).status, 401);
    const own = await request('/evaluate/history?page=1&limit=20', { owner: 'owner-a' });
    assert.equal(own.status, 200);
    assert.equal(own.body.data[0]._id, resultId);
    assert.equal(own.body.pagination.total, 1);
    const other = await request('/evaluate/history', { owner: 'owner-b' });
    assert.deepEqual(other.body.data, []);
    assert.equal(other.body.pagination.total, 0);
  });
});

test('dashboard summary scopes user metrics and aggregates globally for admins', async () => {
  const seen = [];
  const controller = loadTs('src/controllers/dashboard.controller.ts', {
    '../models/document.model': { countDocuments: async filter => { seen.push(filter); return 4; } },
    '../models/evaluation.model': { aggregate: async pipeline => { seen.push(pipeline[0].$match); return [{ _id: 'completed', count: 2 }]; } },
    '../models/cvMatcher.model': { countDocuments: async filter => { seen.push(filter); return 1; } },
    '../models/atsPDF.model': { countDocuments: async filter => { seen.push(filter); return 3; } },
    '../middlewares/error.middleware': { asyncHandler: handler => handler },
  }).dashboardSummary;
  const { invoke } = require('./helpers/load-ts.cjs');
  const user = await invoke(controller, { authUser: { userId: 'owner-a', role: 'user' } });
  assert.deepEqual(user.body.data, { documents: 4, evaluations: { completed: 2 }, cvMatches: 1, generatedCvs: 3 });
  assert.ok(seen.slice(0, 4).every(filter => filter.userId === 'owner-a'));
  seen.length = 0;
  await invoke(controller, { authUser: { userId: 'admin', role: 'admin' } });
  assert.deepEqual(seen.slice(0, 4), [{}, {}, {}, {}]);
});

test('billing catalog is public; wallet and ledger require an active authenticated account', async t => {
  await withServer(t, async request => {
    // Catalog is public
    assert.equal((await request('/billing/catalog')).status, 200);

    // Wallet requires auth
    assert.equal((await request('/billing/wallet')).status, 401);
    assert.equal((await request('/billing/wallet', { owner: 'expired' })).status, 401);
    assert.equal((await request('/billing/wallet', { owner: 'inactive' })).status, 403);
    assert.equal((await request('/billing/wallet', { owner: 'owner-a' })).status, 200);

    // Ledger requires auth
    assert.equal((await request('/billing/ledger')).status, 401);
    assert.equal((await request('/billing/ledger', { owner: 'owner-a' })).status, 200);
  });
});

test('admin goodwill endpoint requires admin role and rejects non-admins', async t => {
  await withServer(t, async request => {
    const body = { credits: 1, caseReference: 'CASE-001', reason: 'Integration contract test reason text' };
    const userId = 'owner-a';
    // No auth
    assert.equal((await request(`/admin/billing/users/${userId}/goodwill`, { method: 'POST', body })).status, 401);
    // Non-admin
    assert.equal((await request(`/admin/billing/users/${userId}/goodwill`, { method: 'POST', owner: 'owner-a', body, csrf: 'synthetic-csrf' })).status, 403);
    // Admin can reach the endpoint (stub returns 201)
    const res = await request(`/admin/billing/users/${userId}/goodwill`, { method: 'POST', owner: 'admin', body, csrf: 'synthetic-csrf' });
    assert.equal(res.status, 201);
  });
});
