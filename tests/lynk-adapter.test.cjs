process.env.LYNK_MERCHANT_KEY = 'synthetic-test-merchant-key';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('./helpers/load-ts.cjs');
const key = process.env.LYNK_MERCHANT_KEY;
const { LynkAdapter } = loadTs('src/features/billing/providers/lynk.adapter.ts', {
  '../../../middlewares/error.middleware': { AppError: class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } } },
});

function payload() {
  return { event: 'payment.received', data: { message_action: 'SUCCESS', message_code: '0', message_id: 'synthetic-event-1', message_data: {
    refId: 'synthetic-ref-1', items: [{ uuid: 'synthetic-product', price: 14000, qty: 1 }], customer: { email: 'buyer@example.com' },
    totals: { grandTotal: 14000, customerPay: 14000, totalItem: 14000, totalAddon: 0, totalShipping: 0, discount: 0 },
  } } };
}

test('Lynk adapter verifies signature with configured key and rejects tampering', () => {
  const adapter = new LynkAdapter();
  const event = payload();
  const signature = createHash('sha256').update(`14000synthetic-ref-1synthetic-event-1${key}`).digest('hex');
  assert.equal(adapter.verifyWebhookSignature(event, signature), true);
  assert.equal(adapter.verifyWebhookSignature(event, `${signature.slice(0, 63)}0`), false);
  assert.equal(adapter.verifyWebhookSignature(event, undefined), false);
});

test('Lynk adapter parses canonical payment fields and rejects unsupported item counts', () => {
  const adapter = new LynkAdapter();
  const event = adapter.parseWebhookPayload(payload());
  assert.equal(event.buyerEmail, 'buyer@example.com');
  assert.equal(event.amountIdr, 14000);
  assert.equal(event.quantity, 1);
  assert.match(event.fingerprint, /^[a-f0-9]{64}$/);
  const invalid = payload();
  invalid.data.message_data.items.push({ uuid: 'other', price: 1, qty: 1 });
  assert.throws(() => adapter.parseWebhookPayload(invalid), /Unsupported Lynk payment event/);
});
