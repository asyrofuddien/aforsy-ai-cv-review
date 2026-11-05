const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const mongoose = require('mongoose');
const { loadTs, invoke, logger } = require('./helpers/load-ts.cjs');

// Always creates and removes its own database; never drops the URI's database.
test('real MongoDB payment admission, signed receipt reconciliation and replay', {
  skip: !process.env.PAYMENT_REGRESSION_MONGO_URI && 'requires PAYMENT_REGRESSION_MONGO_URI pointing to a replica set',
  timeout: 120000,
}, async t => {
  const dbName = `cv_payment_regression_test_${randomUUID().replaceAll('-', '')}`;
  const errors = loadTs('src/middlewares/error.middleware.ts', { '../utils/logger': { ...logger, log() {} } });
  const models = loadTs('src/models/billing.models.ts');
  const User = loadTs('src/models/user.model.ts').default;
  const Audit = loadTs('src/models/adminAuditLog.model.ts').default;
  const config = { billing: { checkoutEnabled: true, mode: 'live', lynkMerchantKey: 'synthetic-integration-merchant-key' } };
  const adapter = loadTs('src/features/billing/providers/lynk.adapter.ts', {
    '../../../config/config': config, '../../../middlewares/error.middleware': errors,
  });
  const billing = loadTs('src/features/billing/billing.service.ts', {
    './credit-settlement': loadTs('src/features/billing/credit-settlement.ts'),
    '../../models/adminAuditLog.model': Audit, '../../models/user.model': User,
    '../../models/billing.models': models, '../../middlewares/error.middleware': errors,
  });
  const { orderService, expirePendingPaymentOrders } = loadTs('src/features/billing/orders/order.service.ts', {
    '../../../config/config': config, '../../../models/user.model': User,
    '../../../models/billing.models': models, '../../../middlewares/error.middleware': errors,
    '../providers/lynk.adapter': adapter,
  });
  const { processLynkInbox } = loadTs('src/features/billing/webhooks/webhook.processor.ts', {
    '../../../config/config': config, '../../../models/user.model': User,
    '../../../models/billing.models': models, '../../../models/adminAuditLog.model': Audit,
    '../billing.service': billing,
  });
  const { receiveLynkWebhook } = loadTs('src/features/billing/webhooks/webhook.receiver.ts', {
    '../../../models/billing.models': models, '../../../models/adminAuditLog.model': Audit,
    '../../../middlewares/error.middleware': errors, '../providers/lynk.adapter': adapter,
  });
  const { BillingPackage, BillingWallet, PaymentOrder, WebhookInbox, CreditLot, CreditLedger, OutboxEvent } = models;
  async function fixture() {
    const id = randomUUID();
    const user = await User.create({ email: `${id}@example.test`, displayName: 'Payment test', isEmailVerified: true, isActive: true });
    const pkg = await BillingPackage.create({ sku: `test.${id}`, version: 1, nameId: 'Paket uji', nameEn: 'Test package', amountIdr: 14000, credits: 12, currency: 'IDR', active: true, effectiveFrom: new Date(0), termsVersion: 'v1', lynkProductId: id, lynkCheckoutUrl: 'https://lynk.id/shop/product' });
    const purchase = (key = randomUUID()) => orderService.createPurchaseIntent({ userId: user.id, sku: pkg.sku, termsVersion: 'v1', idempotencyKey: key, locale: 'id' });
    async function receive({ reference = randomUUID(), email = user.email, amount = 14000, eventId = randomUUID() } = {}) {
      const body = { event: 'payment.received', data: { message_action: 'SUCCESS', message_code: '0', message_id: eventId, message_data: {
        refId: reference, customer: { email }, items: [{ uuid: pkg.lynkProductId, price: amount, qty: 1 }],
        totals: { grandTotal: amount, customerPay: amount, totalItem: amount, totalAddon: 0, totalShipping: 0, discount: 0 },
      } } };
      const signature = createHash('sha256').update(`${amount}${reference}${eventId}${config.billing.lynkMerchantKey}`).digest('hex');
      assert.equal((await invoke(receiveLynkWebhook, { body, header: () => signature })).status, 200);
      return WebhookInbox.findOne({ eventIdentity: eventId });
    }
    const balance = async () => (await BillingWallet.findOne({ userId: user._id }))?.availableCredits || 0;
    const process = async inbox => {
      try { await processLynkInbox(inbox.id); }
      catch (error) { if (error.code !== 11000) throw error; await processLynkInbox(inbox.id); }
    };
    return { user, pkg, purchase, receive, balance, process };
  }
  try {
    await mongoose.connect(process.env.PAYMENT_REGRESSION_MONGO_URI, { dbName, directConnection: true, serverSelectionTimeoutMS: 8000 });
    assert.ok((await mongoose.connection.db.admin().command({ hello: 1 })).setName, 'transactions need a replica set');
    for (const model of [...Object.values(models).filter(value => value?.createIndexes), User, Audit]) await model.createIndexes();

    await t.test('parallel checkout requests admit one intent and replay the same idempotency key', async () => {
      const f = await fixture();
      const attempts = await Promise.allSettled([f.purchase(), f.purchase()]);
      assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
      assert.equal(attempts.find(x => x.status === 'rejected').reason.code, 'PURCHASE_PENDING');
      assert.equal(await PaymentOrder.countDocuments({ userId: f.user._id }), 1);
      const same = await fixture();
      const key = randomUUID();
      const retries = await Promise.all([same.purchase(key), same.purchase(key)]);
      assert.equal(retries[0].orderId, retries[1].orderId);
      assert.equal(await PaymentOrder.countDocuments({ userId: same.user._id }), 1);
    });

    await t.test('multiple expired intents still honor a late signed payment exactly once', async () => {
      const f = await fixture();
      for (let i = 0; i < 3; i++) {
        const order = await f.purchase();
        await PaymentOrder.updateOne({ _id: order.orderId }, { $set: { providerExpiresAt: new Date(0) } });
        await expirePendingPaymentOrders();
      }
      const reference = randomUUID();
      const inbox = await f.receive({ reference });
      await f.process(inbox);
      await f.process(inbox);
      const replay = await f.receive({ reference });
      await f.process(replay);
      assert.equal(await f.balance(), 12);
      assert.equal(await CreditLot.countDocuments({ userId: f.user._id }), 1);
      assert.equal(await CreditLedger.countDocuments({ userId: f.user._id, eventType: 'grant_purchase' }), 1);
      assert.equal(await PaymentOrder.countDocuments({ userId: f.user._id, paymentStatus: 'paid' }), 1);
      const paid = await PaymentOrder.findOne({ userId: f.user._id, paymentStatus: 'paid' });
      assert.equal(await OutboxEvent.countDocuments({ eventKey: `email.purchase_receipt:${paid.id}` }), 1);
      assert.equal((await WebhookInbox.findById(replay.id)).processState, 'processed');
    });

    await t.test('parallel distinct receipts reselect intents and duplicate receipts never double grant', async () => {
      const f = await fixture();
      const first = await f.purchase();
      await PaymentOrder.updateOne({ _id: first.orderId }, { $set: { paymentStatus: 'cancelled' } });
      await f.purchase();
      const a = await f.receive();
      const b = await f.receive();
      await Promise.all([f.process(a), f.process(b)]);
      assert.equal(await f.balance(), 24);
      assert.equal(await PaymentOrder.countDocuments({ userId: f.user._id, paymentStatus: 'paid' }), 2);
      assert.equal(await WebhookInbox.countDocuments({ _id: { $in: [a._id, b._id] }, processState: 'processed' }), 2);
      const duplicate = await fixture();
      await duplicate.purchase();
      const ref = randomUUID();
      const x = await duplicate.receive({ reference: ref });
      const y = await duplicate.receive({ reference: ref });
      await Promise.all([duplicate.process(x), duplicate.process(y)]);
      assert.equal(await duplicate.balance(), 12);
      assert.equal(await CreditLedger.countDocuments({ userId: duplicate.user._id, eventType: 'grant_purchase' }), 1);
    });

    await t.test('wrong buyer or amount cannot claim another intent or add credits', async () => {
      const f = await fixture();
      await f.purchase();
      const wrongBuyer = await f.receive({ email: 'other@example.test' });
      const wrongAmount = await f.receive({ amount: 15000 });
      await f.process(wrongBuyer); await f.process(wrongAmount);
      assert.equal(await f.balance(), 0);
      assert.equal(await PaymentOrder.countDocuments({ userId: f.user._id, paymentStatus: 'pending' }), 1);
      assert.equal(await WebhookInbox.countDocuments({ _id: { $in: [wrongBuyer._id, wrongAmount._id] }, processState: 'rejected' }), 2);
    });

    await t.test('grant failure rolls back paid state and retry grants only once', async () => {
      const f = await fixture();
      await f.purchase();
      await BillingWallet.updateOne({ userId: f.user._id }, { $set: { billingRiskHold: true } });
      const inbox = await f.receive();
      await assert.rejects(f.process(inbox), /on hold or unavailable/);
      assert.equal(await f.balance(), 0);
      assert.equal(await PaymentOrder.countDocuments({ userId: f.user._id, paymentStatus: 'pending' }), 1);
      assert.equal(await CreditLot.countDocuments({ userId: f.user._id }), 0);
      assert.equal((await WebhookInbox.findById(inbox.id)).processState, 'retry');
      await BillingWallet.updateOne({ userId: f.user._id }, { $set: { billingRiskHold: false } });
      await f.process(inbox);
      assert.equal(await f.balance(), 12);
      assert.equal(await CreditLedger.countDocuments({ userId: f.user._id, eventType: 'grant_purchase' }), 1);
    });

    await t.test('inactive buyer payment persists atomically for later claim without granting', async () => {
      const f = await fixture();
      await f.purchase();
      await User.updateOne({ _id: f.user._id }, { $set: { isActive: false } });
      const inbox = await f.receive(); await f.process(inbox);
      assert.equal(await f.balance(), 0);
      const order = await PaymentOrder.findOne({ buyerEmail: f.user.email });
      assert.equal(order.paymentStatus, 'paid');
      assert.equal(order.fulfillmentStatus, 'pending');
      assert.equal(order.userId, null);
      assert.equal((await WebhookInbox.findById(inbox.id)).processState, 'processed');
    });
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
