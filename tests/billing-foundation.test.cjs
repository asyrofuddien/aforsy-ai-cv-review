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
  assert.ok(indexes.get('billing_packages').includes('sku_active_unique'));
  assert.ok(indexes.get('action_costs').includes('action_active_unique'));
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

test('wallet and package amounts require integer values and allow the approved free trial', async () => {
  const BillingWallet = mongoose.model('BillingWallet');
  const BillingPackage = mongoose.model('BillingPackage');
  const wallet = new BillingWallet({
    userId: new mongoose.Types.ObjectId(), availableCredits: -1, reservedCredits: 0, version: 0,
  });
  const billingPackage = new BillingPackage({
    sku: 'fixture', version: 1, nameId: 'Fixture', nameEn: 'Fixture', currency: 'IDR',
    amountIdr: 1000.5, credits: 3, effectiveFrom: new Date(), termsVersion: 'v1',
  });
  const trialPackage = new BillingPackage({
    sku: 'welcome.v1', version: 1, nameId: 'Trial', nameEn: 'Welcome', currency: 'IDR',
    amountIdr: 0, credits: 4, effectiveFrom: new Date(), termsVersion: 'v1',
  });

  await assert.rejects(wallet.validate(), /minimum allowed value/);
  await assert.rejects(billingPackage.validate(), /amountIdr/);
  await assert.doesNotReject(trialPackage.validate());
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
  const stagingEnv = {
    ...process.env,
    NODE_ENV: 'development',
    MONGODB_URI: uri,
    BILLING_MIGRATION_TARGET: 'staging',
    CREDIT_TRIAL_ENABLED: 'true',
  };
  const seedCatalog = () => spawnSync(process.execPath, [
    require.resolve('ts-node/dist/bin.js'), 'scripts/seed-billing-catalog.ts', '--apply',
  ], {
    cwd: require('node:path').resolve(__dirname, '..'),
    encoding: 'utf8',
    env: stagingEnv,
  });
  const seededCatalog = seedCatalog();
  assert.equal(seededCatalog.status, 0, seededCatalog.stderr);
  assert.equal(seedCatalog().status, 0);

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
  let billingTestUserId;
  let backfillTestUserId;
  let auditCollection;
  const actionCostVersion = Date.now();
  let priorActiveCostIds = [];
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

    const User = loadTs('src/models/user.model.ts').default;
    const ActionCost = mongoose.model('ActionCost');
    const testUser = await User.create({
      email: `billing-${suffix}@example.test`,
      displayName: 'Billing integration test',
      role: 'admin',
      isEmailVerified: true,
      isActive: true,
    });
    billingTestUserId = testUser._id;
    priorActiveCostIds = (await ActionCost.find({ action: 'cv_review_bundle', active: true }).select('_id').lean())
      .map(cost => cost._id);
    await ActionCost.updateMany({ action: 'cv_review_bundle', active: true }, { $set: { active: false } });
    await ActionCost.create({
      action: 'cv_review_bundle',
      version: actionCostVersion,
      creditsRequired: 3,
      active: true,
    });
    const billingModels = loadTs('src/models/billing.models.ts');
    const auditModel = loadTs('src/models/adminAuditLog.model.ts').default;
    class TestAppError extends Error {
      constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
      }
    }
    const { billingService } = loadTs('src/features/billing/billing.service.ts', {
      '../../config/config': { billing: { trialEnabled: true, adminGrantsEnabled: true } },
      '../../middlewares/error.middleware': { AppError: TestAppError },
      '../../models/adminAuditLog.model': auditModel,
      '../../models/user.model': User,
      '../../models/billing.models': billingModels,
    });
    const [firstTrial, concurrentTrial] = await Promise.all([
      billingService.grantWelcomeTrial(testUser.id),
      billingService.grantWelcomeTrial(testUser.id),
    ]);
    const repeatedTrial = await billingService.grantWelcomeTrial(testUser.id);
    assert.deepEqual([firstTrial.granted, concurrentTrial.granted].sort(), [false, true]);
    assert.equal(repeatedTrial.granted, false);

    const goodwillInput = {
      actorId: testUser.id,
      userId: testUser.id,
      credits: 2,
      caseReference: `TEST-${suffix}`,
      reason: 'Integration test support credit',
      idempotencyKey: `goodwill-${suffix}`,
    };
    assert.equal((await billingService.grantGoodwill(goodwillInput)).granted, true);
    assert.equal((await billingService.grantGoodwill(goodwillInput)).granted, false);
    auditCollection = mongoose.model('AdminAuditLog').collection.name;
    assert.equal(await mongoose.model('AdminAuditLog').countDocuments({ actorUserId: billingTestUserId }), 1);

    const operationInput = {
      userId: testUser.id,
      action: 'cv_review_bundle',
      locale: 'en',
      inputFingerprint: require('node:crypto').createHash('sha256').update(suffix).digest('hex'),
      inputSnapshotRef: `test:${suffix}`,
      idempotencyKey: `operation-${suffix}`,
    };
    const [held, repeatedHold] = await Promise.all([
      billingService.createCreditOperation(operationInput),
      billingService.createCreditOperation(operationInput),
    ]);
    assert.deepEqual([held.reused, repeatedHold.reused].sort(), [false, true]);
    await assert.rejects(
      billingService.createCreditOperation({
        ...operationInput,
        inputFingerprint: require('node:crypto').createHash('sha256').update(`different:${suffix}`).digest('hex'),
      }),
      error => error.statusCode === 409,
    );
    assert.equal((await billingService.getWallet(testUser.id)).wallet.availableCredits, 3);
    assert.equal((await billingService.getWallet(testUser.id)).wallet.reservedCredits, 3);
    assert.equal((await billingService.settleCreditOperation(held.operation.id, 'capture')).settled, true);
    assert.equal((await billingService.settleCreditOperation(held.operation.id, 'capture')).settled, false);
    assert.equal((await billingService.getWallet(testUser.id)).consistent, true);

    const releasable = await billingService.createCreditOperation({
      ...operationInput,
      idempotencyKey: `release-${suffix}`,
      inputFingerprint: require('node:crypto').createHash('sha256').update(`release:${suffix}`).digest('hex'),
    });
    assert.equal((await billingService.settleCreditOperation(releasable.operation.id, 'release')).settled, true);
    assert.equal((await billingService.getWallet(testUser.id)).wallet.availableCredits, 3);
    assert.equal((await billingService.getWallet(testUser.id)).wallet.reservedCredits, 0);
    assert.equal((await billingService.getWallet(testUser.id)).consistent, true);

    const backfillUser = await User.create({
      email: `billing-backfill-${suffix}@example.test`,
      displayName: 'Billing backfill test',
      isEmailVerified: true,
      isActive: true,
    });
    backfillTestUserId = backfillUser._id;
    const previewBackfill = spawnSync(process.execPath, [
      require.resolve('ts-node/dist/bin.js'), 'scripts/backfill-welcome-trial.ts',
    ], {
      cwd: require('node:path').resolve(__dirname, '..'),
      encoding: 'utf8',
      env: stagingEnv,
    });
    assert.equal(previewBackfill.status, 0, previewBackfill.stderr);
    const preview = JSON.parse(previewBackfill.stdout);
    assert.deepEqual(
      [preview.eligibleAccounts, preview.alreadyGranted, preview.pending],
      [2, 1, 1],
    );
    assert.doesNotMatch(previewBackfill.stdout, /billing-|@example\.test/);
    const backfill = () => spawnSync(process.execPath, [
      require.resolve('ts-node/dist/bin.js'), 'scripts/backfill-welcome-trial.ts', '--apply',
    ], {
      cwd: require('node:path').resolve(__dirname, '..'),
      encoding: 'utf8',
      env: stagingEnv,
    });
    const appliedBackfill = backfill();
    assert.equal(appliedBackfill.status, 0, appliedBackfill.stderr);
    assert.equal(JSON.parse(appliedBackfill.stdout).granted, 1);
    assert.equal((await billingService.getWallet(backfillUser.id)).wallet.availableCredits, 4);
    assert.equal(JSON.parse(backfill().stdout).processed, 0);
  } finally {
    await session.endSession();
    await db.collection('billing_wallets').deleteOne({ userId: uniqueUserId });
    await db.collection('credit_ledger').deleteOne({ eventKey: uniqueEventKey });
    for (const collection of collections) {
      await db.dropCollection(collection).catch(error => {
        if (error.codeName !== 'NamespaceNotFound') throw error;
      });
    }
    if (billingTestUserId || backfillTestUserId) {
      const userIds = [billingTestUserId, backfillTestUserId].filter(Boolean);
      for (const collection of [
        'billing_wallets', 'credit_lots', 'credit_reservations', 'credit_ledger',
        'ai_operations', 'idempotency_records',
      ]) {
        await db.collection(collection).deleteMany({ userId: { $in: userIds } });
      }
      if (auditCollection) await db.collection(auditCollection).deleteMany({ actorUserId: { $in: userIds } });
      await db.collection('users').deleteMany({ _id: { $in: userIds } });
      await db.collection('billing_backfill_checkpoints').deleteOne({ checkpointKey: 'welcome.v1_trial_backfill_v1' });
      await db.collection('action_costs').deleteOne({ action: 'cv_review_bundle', version: actionCostVersion });
      if (priorActiveCostIds.length) {
        await db.collection('action_costs').updateMany(
          { _id: { $in: priorActiveCostIds } },
          { $set: { active: true } },
        );
      }
    }
    await mongoose.disconnect();
  }
});
