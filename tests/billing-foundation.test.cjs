const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

const { billingModelIndexPlan } = loadTs('src/models/billing.models.ts');

test('billing models define the planned unique and recovery indexes', () => {
  const indexes = new Map(billingModelIndexPlan.map(model => [
    model.collection,
    model.indexes.map(([, options]) => options.name),
  ]));

  assert.ok(indexes.get('billing_wallets').includes('user_unique'));
  assert.ok(indexes.get('credit_lots').includes('grant_key_unique'));
  assert.ok(indexes.get('credit_reservations').includes('reservation_key_unique'));
  assert.ok(indexes.get('credit_ledger').includes('event_key_unique'));
  assert.ok(indexes.get('ai_operations').includes('status_lease_until'));
  assert.ok(indexes.get('payment_orders').includes('payment_status_updated_at'));
  assert.ok(indexes.get('webhook_inbox').includes('provider_event_unique'));
  assert.ok(indexes.get('outbox_events').includes('state_next_attempt_at'));
  assert.ok(indexes.get('idempotency_records').includes('user_scope_key_unique'));
});

test('credit lot schema rejects negative, fractional, and unbalanced amounts', async () => {
  const CreditLot = mongoose.model('CreditLot');
  const userId = new mongoose.Types.ObjectId();
  const create = fields => new CreditLot({
    userId, sourceType: 'trial', sourceId: 'trial-v1', grantKey: 'grant:trial:v1',
    granted: 5, available: 5, reserved: 0, consumed: 0, revoked: 0, ...fields,
  });

  await assert.doesNotReject(create({}).validate());
  await assert.rejects(create({ granted: 4 }).validate(), /Credit lot invariant violated/);
  await assert.rejects(create({ available: -1 }).validate());
  await assert.rejects(create({ available: 1.5 }).validate());
});

test('wallet and package amounts require non-negative integer credits and positive integer prices', async () => {
  const BillingWallet = mongoose.model('BillingWallet');
  const BillingPackage = mongoose.model('BillingPackage');
  const wallet = new BillingWallet({
    userId: new mongoose.Types.ObjectId(), availableCredits: -1, reservedCredits: 0, version: 0,
  });
  const billingPackage = new BillingPackage({
    sku: 'fixture', version: 1, nameId: 'Fixture', nameEn: 'Fixture', currency: 'IDR',
    amountIdr: 1000.5, credits: 3, effectiveFrom: new Date(), termsVersion: 'v1',
  });

  await assert.rejects(wallet.validate(), /minimum allowed value/);
  await assert.rejects(billingPackage.validate(), /amountIdr/);
});

test('credit ledger rejects updates and deletions at the model boundary', async () => {
  const CreditLedger = mongoose.model('CreditLedger');
  const event = new CreditLedger({
    userId: new mongoose.Types.ObjectId(), eventKey: 'fixture-event', eventType: 'grant_trial',
    deltaAvailable: 4, deltaReserved: 0, deltaConsumed: 0, deltaRevoked: 0,
    creditsGrantedDelta: 4, reasonCode: 'trial', actorType: 'system', policyVersion: 'v1',
  });
  event.isNew = false;
  await assert.rejects(event.save(), /append-only/);
  await assert.rejects(CreditLedger.updateOne({ eventKey: 'fixture-event' }, { $set: { deltaAvailable: 0 } }).exec(), /append-only/);
  await assert.rejects(CreditLedger.deleteOne({ eventKey: 'fixture-event' }).exec(), /append-only/);
});

test('billing index migration defaults to dry-run and never connects to MongoDB', async () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [
    require.resolve('ts-node/dist/bin.js'),
    'scripts/migrate-billing-indexes.ts',
  ], {
    cwd: require('node:path').resolve(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, MONGODB_URI: 'mongodb://127.0.0.1:27017/cv-evaluation-test' },
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.databaseName, 'cv-evaluation-test');
  assert.ok(report.indexes.length > 10);
});

test('optional replica-set transaction test requires an isolated test database', {
  skip: !process.env.MONGODB_TEST_URI,
}, async () => {
  const uri = process.env.MONGODB_TEST_URI;
  const databaseName = new URL(uri).pathname.slice(1);
  assert.match(databaseName, /(?:^|[-_])test(?:$|[-_])/i, 'MONGODB_TEST_URI must select a test database');
  assert.match(databaseName, /(?:^|[-_])staging(?:$|[-_])/i, 'MONGODB_TEST_URI must use an isolated staging-named test database');
  await mongoose.connect(uri);
  const { spawnSync } = require('node:child_process');
  const migration = () => spawnSync(process.execPath, [
    require.resolve('ts-node/dist/bin.js'), 'scripts/migrate-billing-indexes.ts', '--apply',
  ], {
    cwd: require('node:path').resolve(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'development', MONGODB_URI: uri, BILLING_MIGRATION_TARGET: 'staging' },
  });
  const applied = migration();
  assert.equal(applied.status, 0, applied.stderr);
  const rerun = migration();
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.match(rerun.stdout, /already-applied/);

  const { probeMongoTransactions } = loadTs('src/services/mongo-transaction-readiness.ts', {
    '../middlewares/error.middleware': { AppError: class AppError extends Error {} },
    '../utils/logger': logger,
  });
  assert.equal(await probeMongoTransactions(), true);

  const suffix = `${process.pid}_${Date.now()}`;
  const collections = ['wallet', 'lot', 'ledger', 'operation'].map(name => `m2_probe_${name}_${suffix}`);
  const db = mongoose.connection.db;
  const session = await mongoose.startSession();
  const uniqueUserId = new mongoose.Types.ObjectId();
  const uniqueEventKey = `m2-test-event-${suffix}`;
  try {
    const wallet = { userId: uniqueUserId, availableCredits: 1, reservedCredits: 0, version: 0, billingRiskHold: false };
    await db.collection('billing_wallets').insertOne(wallet);
    await assert.rejects(db.collection('billing_wallets').insertOne(wallet), error => error.code === 11000);
    const ledgerEvent = {
      userId: uniqueUserId, eventKey: uniqueEventKey, eventType: 'grant_trial',
      deltaAvailable: 1, deltaReserved: 0, deltaConsumed: 0, deltaRevoked: 0,
      creditsGrantedDelta: 1, reasonCode: 'test', actorType: 'system', policyVersion: 'test',
    };
    await db.collection('credit_ledger').insertOne(ledgerEvent);
    await assert.rejects(db.collection('credit_ledger').insertOne(ledgerEvent), error => error.code === 11000);

    session.startTransaction();
    try {
      for (const [index, collection] of collections.entries()) {
        await db.collection(collection).insertOne({ probe: suffix, index }, { session });
      }
      throw new Error('injected transaction abort');
    } catch (error) {
      await session.abortTransaction();
      assert.match(error.message, /injected transaction abort/);
    }

    for (const collection of collections) {
      assert.equal(await db.collection(collection).countDocuments({ probe: suffix }), 0);
    }

    await session.withTransaction(async () => {
      for (const [index, collection] of collections.entries()) {
        await db.collection(collection).insertOne({ probe: suffix, index }, { session });
      }
    });
    for (const collection of collections) {
      assert.equal(await db.collection(collection).countDocuments({ probe: suffix }), 1);
    }
  } finally {
    await session.endSession();
    await db.collection('billing_wallets').deleteOne({ userId: uniqueUserId });
    await db.collection('credit_ledger').deleteOne({ eventKey: uniqueEventKey });
    for (const collection of collections) {
      await db.dropCollection(collection).catch(error => {
        if (error.codeName !== 'NamespaceNotFound') throw error;
      });
    }
    await mongoose.disconnect();
  }
});
