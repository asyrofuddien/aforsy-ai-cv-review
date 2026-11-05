const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, invoke } = require('./helpers/load-ts.cjs');
const credentials = loadTs('src/features/auth/credentials.crypto.ts');
const policy = loadTs('src/features/auth/password-policy.ts');
class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

test('password requirements reject each missing requirement', () => {
  for (const password of ['', 'shortA1!', 'longpassword1!', 'LONGPASSWORD1!', 'LongPassword!!', 'LongPassword12', 'LongPassword12 ', 'aA1!' + 'x'.repeat(125), '  StrongPass12!  ', 'StrongPass12!']) {
    assert.equal(policy.isStrongPassword(password), password === '  StrongPass12!  ' || password === 'StrongPass12!');
  }
  assert.equal(policy.isStrongPassword(null), false);
});

test('new password endpoints reject weak values; login preserves exact password', async () => {
  const seen = [];
  const user = { id: 'u', isEmailVerified: true, isActive: true, passwordHash: 'hash', save: async () => {} };
  const { AuthController } = loadTs('src/controllers/auth.controller.ts', {
    '../features/auth/password-policy': policy, '../utils/locale': {},
    '../middlewares/error.middleware': { AppError, asyncHandler },
    '../models/user.model': { findOne: () => ({ select: async () => user }), findById: () => ({ select: async () => user }) },
    '../models/authSession.model': { deleteMany: async () => {} },
    '../services/auth.service': { verifyPassword: async p => { seen.push(p); return true; }, hashPassword: async p => { seen.push(p); return 'hash'; }, promoteConfiguredAdmin: async () => {}, issueSession: async () => ({}), asPublicUser: u => u },
    '../features/auth/google-oauth.controller': {}, '../features/billing/billing.service': { billingService: { grantWelcomeTrial: async () => {} } },
  });
  const c = new AuthController();
  for (const handler of [c.register, c.resetPassword, c.changePassword])
    await assert.rejects(invoke(handler, { body: { email: 't@example.com', displayName: 'T', password: 'weakpassword', newPassword: 'weakpassword', currentPassword: 'old', token: 'token' } }), { statusCode: 400 });
  assert.deepEqual(seen, []);
  const password = '  StrongPass12!  ';
  await invoke(c.login, { body: { email: 't@example.com', password } });
  await invoke(c.changePassword, { body: { currentPassword: password, newPassword: 'NewStrongPass12!' }, authUser: { userId: 'u' }, authSession: { id: 's' } });
  assert.deepEqual(seen, [password, password, 'NewStrongPass12!']);
});

test('CSRF survives loading another tab and refreshing the shared session', async () => {
  let row, raw;
  const cookie = { setSessionCookie: (_req, _res, value) => { raw = value; }, clearSessionCookie() {}, sessionCookieName: 'session', getCookie: value => value };
  const auth = loadTs('src/features/auth/auth.service.ts', {
    './credentials.crypto': credentials, './session-cookie.adapter': cookie, './email-actions.service': {},
    '../../models/authSession.model': { create: async value => { row = value; }, findByIdAndUpdate: async (_id, value) => Object.assign(row, value) },
  });
  const first = await auth.issueSession({ _id: 'u' }, {}, {});
  const second = await auth.getSessionCsrfToken('s', raw);
  const refreshed = await auth.refreshSession({ headers: { cookie: raw }, authSession: { id: 's', createdAt: new Date() } }, {});
  assert.equal(first.csrfToken, second);
  assert.equal(second, refreshed.csrfToken);
  assert.equal(auth.verifyCsrf(first.csrfToken, row.csrfHash), true);
});

test('email tokens can only be claimed once by simultaneous requests', async () => {
  let used = false;
  const action = loadTs('src/features/auth/email-actions.service.ts', {
    './credentials.crypto': credentials, './email.adapter': {},
    '../../models/emailToken.model': { findOneAndUpdate: (filter, update) => ({ select: async () => {
      assert.equal(filter.usedAt.$exists, false);
      assert.ok(filter.expiresAt.$gt instanceof Date);
      assert.ok(update.$set.usedAt instanceof Date);
      if (used) return null;
      used = true;
      return { userId: 'u' };
    } }) },
    '../../models/user.model': { findById: () => ({ select: async () => ({ id: 'u' }) }) },
  });
  const results = await Promise.all([action.consumeEmailAction('secret', 'reset-password'), action.consumeEmailAction('secret', 'reset-password')]);
  assert.equal(results.filter(Boolean).length, 1);
});
