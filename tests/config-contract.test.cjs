const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const { parseEnvironment, validateBillingStartup } = loadTs('src/config/environment.ts');

test('environment schema applies development defaults and normalizes numeric values', () => {
  const config = parseEnvironment({ SMTP_PORT: '1025', CORS_ORIGINS: ' https://app.example,https://admin.example ' });
  assert.equal(config.PORT, 3001);
  assert.equal(config.PORT, 3001);
  assert.equal(config.EMAIL_PROVIDER, 'smtp');
  assert.equal(config.CREDIT_TRIAL_ENABLED, false);
  assert.equal(config.CREDIT_ADMIN_GRANTS_ENABLED, false);
  assert.equal(config.BILLING_ADMIN_TEST_PAYMENTS_ENABLED, false);
  assert.equal(config.SMTP_HOST, 'localhost');
  assert.equal(config.SMTP_PORT, 1025);
  assert.deepEqual(config.CORS_ORIGINS, ' https://app.example,https://admin.example ');
});

test('environment schema uses safe production defaults and accepts existing provider settings', () => {
  const config = parseEnvironment({
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'resend',
    RAPIDAPI_PLATFORM: 'linkedin',
    RAPIDAPI_MAX_PAGES: '3',
    GREENHOUSE_BOARDS: 'example,another-board',
  });
  assert.equal(config.EMAIL_PROVIDER, 'resend');
  assert.equal(config.BILLING_ADMIN_TEST_PAYMENTS_ENABLED, false);
  assert.equal(config.SMTP_HOST, '');
  assert.equal(config.RAPIDAPI_MAX_PAGES, 3);
  assert.equal(config.GREENHOUSE_BOARDS, 'example,another-board');
  assert.equal(config.CORS_ORIGINS, '');
});

test('invalid environment configuration reports key names without leaking values', () => {
  assert.throws(
    () => parseEnvironment({ PORT: 'not-a-port', RAPIDAPI_KEY: 'private-secret' }),
    (error) => {
      assert.match(error.message, /PORT/);
      assert.doesNotMatch(error.message, /private-secret/);
      return true;
    },
  );
});


test('billing mode rejects invalid values and live mode without merchant key', () => {
  assert.throws(() => parseEnvironment({ BILLING_MODE: 'production' }), /BILLING_MODE/);
  assert.throws(() => validateBillingStartup({ BILLING_MODE: 'live', LYNK_MERCHANT_KEY: '' }), /LYNK_MERCHANT_KEY/);
  assert.doesNotThrow(() => validateBillingStartup({ BILLING_MODE: 'live', LYNK_MERCHANT_KEY: 'configured-secret' }));
  assert.doesNotThrow(() => validateBillingStartup({ BILLING_MODE: 'disabled' }));
});
