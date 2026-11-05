const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

const reviewId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const draftId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const applicationId = 'cccccccccccccccccccccccc';
const { AppError, asyncHandler } = loadTs('src/middlewares/error.middleware.ts', {
  '../utils/logger': logger,
});

function fixture() {
  const writes = [];
  const review = {
    exists: async ({ _id, userId }) => _id === reviewId && userId === 'owner-a',
    findOne: ({ _id, userId }) => ({
      select: () => ({ lean: async () =>
        _id === reviewId && userId === 'owner-a'
          ? { result: { criteria: [{ id: 'impact' }] } }
          : null }),
    }),
  };
  const draft = {
    exists: async ({ _id, userId }) => _id === draftId && userId === 'owner-a',
  };
  const application = {
    countDocuments: async () => 0,
    create: async (data) => { writes.push(data); return data; },
    findOneAndUpdate: async ({ _id, userId }, update) =>
      _id === applicationId && userId === 'owner-a' ? update.$set : null,
  };
  const feedback = {
    findOneAndUpdate: async (filter, update) => { writes.push({ filter, update }); return update.$set; },
  };
  const empty = {};
  const router = loadTs('src/features/career-workspace/workspace.routes.ts', {
    '../../middlewares/error.middleware': { AppError, asyncHandler },
    '../../middlewares/auth.middleware': { requireAdmin: (req, _res, next) =>
      req.authUser.role === 'admin' ? next() : next(new AppError('Forbidden', 403)) },
    '../../models/evaluation.model': review,
    '../../models/savedCvDraft.model': draft,
    '../../models/document.model': empty,
    '../../models/atsPDF.model': empty,
    '../../models/user.model': empty,
    '../../models/adminAuditLog.model': empty,
    '../../models/billing.models': {
      AiOperation: empty, CreditReservation: empty,
      PaymentOrder: { exists: async () => false }, WebhookInbox: empty,
    },
    './workspace.models': {
      DraftRevision: empty, JobApplication: application,
      ReviewFeedback: feedback, SupportCase: empty,
    },
  }).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = { userId: req.header('x-user') || 'owner-b', role: req.header('x-role') || 'user' };
    next();
  });
  app.use('/workspace', router);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: error.message }));
  return { app, writes };
}

test('workspace mutations validate resource ownership and admin access', async (t) => {
  const { app, writes } = fixture();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const request = async (path, user, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/workspace${path}`, {
      method,
      headers: { 'x-user': user, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.status;
  };

  assert.equal(await request('/admin/cases', 'owner-a'), 403);
  assert.equal(await request(`/feedback/${reviewId}`, 'owner-b', 'PUT', { helpful: true }), 404);
  assert.equal(await request('/applications', 'owner-b', 'POST', {
    title: 'Engineer', company: 'Example', draftId,
  }), 404);
  assert.equal(await request(`/applications/${applicationId}`, 'owner-b', 'PATCH', { status: 'applied' }), 404);
  assert.equal(writes.length, 0);

  assert.equal(await request(`/feedback/${reviewId}`, 'owner-a', 'PUT', {
    helpful: true, appliedCriteria: ['invented'],
  }), 400);
  assert.equal(await request(`/feedback/${reviewId}`, 'owner-a', 'PUT', {
    helpful: true, appliedCriteria: ['impact'],
  }), 200);
  assert.equal(writes.length, 1);
});
