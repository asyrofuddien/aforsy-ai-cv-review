const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
const query = value => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), select: async () => value, session: async () => value });

test('a package admits one pending purchase; same-key retries return the original order', async () => {
  const orders = [];
  const session = { withTransaction: async fn => fn(), endSession: async () => {} };
  const pkg = { sku: 'starter.v1', version: 1, termsVersion: 'v1', credits: 20, amountIdr: 10000, currency: 'IDR', lynkProductId: 'product', lynkCheckoutUrl: 'https://lynk.id/shop/product' };
  const { orderService } = loadTs('src/features/billing/orders/order.service.ts', {
    mongoose: { startSession: async () => session },
    '../../../middlewares/error.middleware': { AppError },
    '../../../config/config': { billing: { checkoutEnabled: true, mode: 'live' } },
    '../../../models/user.model': { findOne: () => query({ _id: 'u', email: 'u@example.com' }) },
    '../providers/lynk.adapter': { lynkAdapter: { createOrderUrl: () => pkg.lynkCheckoutUrl } },
    '../../../models/billing.models': {
      BillingPackage: { findOne: () => query(pkg) },
      BillingWallet: { findOneAndUpdate: async () => {} },
      PaymentOrder: {
        updateMany: async () => ({ modifiedCount: 0 }),
        findOne: filter => query(orders.find(order => order.userId === filter.userId && order.idempotencyKey === filter.idempotencyKey)),
        exists: filter => { assert.equal(filter['packageSnapshot.sku'], pkg.sku); return query(orders.some(order => order.paymentStatus === 'pending')); },
        countDocuments: () => query(orders.length),
        create: async ([order]) => { order._id = 'order-1'; orders.push(order); return [order]; },
      },
    },
  });
  const input = { userId: 'u', sku: pkg.sku, termsVersion: 'v1', idempotencyKey: 'request-1', locale: 'id' };
  const first = await orderService.createPurchaseIntent(input);
  const retry = await orderService.createPurchaseIntent(input);
  assert.equal(first.orderId, retry.orderId);
  await assert.rejects(orderService.createPurchaseIntent({ ...input, idempotencyKey: 'request-2' }), { statusCode: 409 });
  assert.equal(orders.length, 1);
});
