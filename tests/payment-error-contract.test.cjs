const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, logger } = require('./helpers/load-ts.cjs');
const { AppError, errorMiddleware } = loadTs('src/middlewares/error.middleware.ts', { '../utils/logger': { ...logger, log() {} } });
const { localeMiddleware } = loadTs('src/middlewares/locale.middleware.ts', {
  '../utils/locale': { requestLocale: req => req.locale },
});

for (const locale of ['id', 'en']) for (const [code, message] of [
  ['PURCHASE_PENDING', 'You already have a pending purchase for this package. Open it from your billing history.'],
  ['PURCHASE_PENDING_LIMIT', 'You already have two pending purchases.'],
]) {
  test(`payment error ${code} survives localization in ${locale}`, () => {
    let body;
    const req = { locale, baseUrl: '/api', path: '/billing/purchase-intents', method: 'POST' };
    const res = { locals: {}, statusCode: 200, setHeader() {}, vary() {}, status(code) { this.statusCode = code; return this; }, json(value) { body = value; return this; } };
    localeMiddleware(req, res, () => {});
    errorMiddleware(new AppError(message, 409, code), req, res, () => {});
    assert.equal(res.statusCode, 409);
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, 'string');
    if (locale === 'id') assert.notEqual(body.error.message, message);
  });
}
