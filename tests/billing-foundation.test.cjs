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

test('replica-set billing and durable operation properties run only on an isolated test database', {
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
  let durableOperationIds = [];
  let durableEvaluationIds = [];
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
      './credit-settlement': loadTs('src/features/billing/credit-settlement.ts'),
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

    const evaluationModel = loadTs('src/models/evaluation.model.ts').default;
    const { operationService } = loadTs('src/features/ai-operations/operation.service.ts', {
      '../../middlewares/error.middleware': { AppError: TestAppError },
      '../../models/billing.models': billingModels,
      '../billing/billing.service': { billingService },
      '../../models/evaluation.model': evaluationModel,
    });
    const cvDocumentId = new mongoose.Types.ObjectId();
    const durableKey = `durable-${suffix}`;
    const durableInput = {
      userId: testUser.id, action: 'cv_review_bundle', locale: 'en',
      inputFingerprint: require('node:crypto').createHash('sha256').update(`durable:${suffix}`).digest('hex'),
      inputSnapshotRef: `document:${cvDocumentId}`, idempotencyKey: durableKey,
      inputSnapshot: { cvDocumentId: String(cvDocumentId), candidateName: 'Integration Candidate' },
    };
    const durableResults = await Promise.all([
      operationService.createAndReserve(durableInput),
      operationService.createAndReserve(durableInput),
    ]);
    assert.deepEqual(durableResults.map(item => item.reused).sort(), [false, true]);
    const durableOperationId = durableResults[0].operation._id;
    durableOperationIds = [durableOperationId];
    const durableOperation = await mongoose.model('AiOperation').findById(durableOperationId).lean();
    assert.ok(durableOperation.resourceId, 'review operation should link the review resource');
    durableEvaluationIds = [durableOperation.resourceId];
    assert.equal(await mongoose.model('AiOperation').countDocuments({ userId: testUser._id, clientIntentKey: durableKey }), 1);
    assert.equal(await mongoose.model('CreditReservation').countDocuments({ referenceId: durableOperationId }), 1);
    assert.equal(await mongoose.model('OutboxEvent').countDocuments({ entityId: durableOperationId, type: 'ai-operation.enqueue' }), 1);
    await assert.rejects(operationService.createAndReserve({
      ...durableInput,
      inputFingerprint: require('node:crypto').createHash('sha256').update(`different:${suffix}`).digest('hex'),
    }), error => error.statusCode === 409);
    assert.equal(await mongoose.model('AiOperation').countDocuments({ userId: testUser._id, clientIntentKey: durableKey }), 1);

    const workerTokens = [`worker-a-${suffix}`, `worker-b-${suffix}`];
    const claims = await Promise.allSettled(workerTokens.map(token => operationService.claimLease(String(durableOperationId), token)));
    assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1, 'only one concurrent worker may claim a lease');
    const winningToken = workerTokens[claims.findIndex(result => result.status === 'fulfilled')];
    const losingToken = workerTokens[1 - claims.findIndex(result => result.status === 'fulfilled')];
    await operationService.heartbeat(String(durableOperationId), winningToken);
    await assert.rejects(operationService.heartbeat(String(durableOperationId), losingToken), error => error.statusCode === 409);

    await operationService.saveResultAndCapture(String(durableOperationId), { evaluationId: String(durableOperation.resourceId) }, winningToken);
    const capturesAfterFirstFinalize = await mongoose.model('CreditLedger').countDocuments({ operationId: durableOperationId, eventType: 'capture_ai' });
    await operationService.saveResultAndCapture(String(durableOperationId), { evaluationId: String(durableOperation.resourceId) }, winningToken);
    assert.equal(await mongoose.model('CreditLedger').countDocuments({ operationId: durableOperationId, eventType: 'capture_ai' }), capturesAfterFirstFinalize, 'replay must not write additional capture ledger entries');
    const completedOperation = await mongoose.model('AiOperation').findById(durableOperationId).lean();
    assert.equal(completedOperation.status, 'completed');

    const operationController = loadTs('src/features/ai-operations/operation.controller.ts', {
      '../../middlewares/error.middleware': { AppError: TestAppError, asyncHandler: handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next) },
      '../../models/billing.models': billingModels,
    });
    const { invoke } = require('./helpers/load-ts.cjs');
    const ownedResult = await invoke(operationController.getOperationResult, { params: { id: String(durableOperationId) }, authUser: { userId: testUser.id } });
    assert.equal(ownedResult.status, 200);
    await assert.rejects(invoke(operationController.getOperationResult, { params: { id: String(durableOperationId) }, authUser: { userId: new mongoose.Types.ObjectId().toString() } }), error => error.statusCode === 403);

    const notificationModel = loadTs('src/models/userNotification.model.ts').default;
    const { runAiResultCleanup } = loadTs('src/workers/cleanup.worker.ts', {
      '../models/billing.models': billingModels,
      '../models/userNotification.model': notificationModel,
      '../utils/logger': logger,
    });
    const operationResult = await mongoose.model('AiOperationResult').findOne({ operationId: durableOperationId });
    const reminderNow = new Date();
    await mongoose.model('AiOperationResult').updateOne({ _id: operationResult._id }, { $set: { expiresAt: new Date(reminderNow.getTime() + 6 * 86400000) }, $unset: { reminderSentAt: 1 } });
    await runAiResultCleanup(reminderNow);
    await runAiResultCleanup(reminderNow);
    const expiryEventKey = `ai-result-expiry:${durableOperationId}`;
    assert.equal(await mongoose.model('OutboxEvent').countDocuments({ eventKey: `${expiryEventKey}:email` }), 1);
    assert.equal(await notificationModel.countDocuments({ eventKey: expiryEventKey }), 1);
    await mongoose.model('AiOperationResult').updateOne({ _id: operationResult._id }, { $set: { expiresAt: new Date(reminderNow.getTime() - 1) } });
    await runAiResultCleanup(reminderNow);
    await runAiResultCleanup(reminderNow);
    const expiredResult = await mongoose.model('AiOperationResult').findById(operationResult._id).select('+resultData').lean();
    assert.equal(expiredResult.state, 'expired');
    assert.equal(expiredResult.resultData, undefined, 'expired result payload should be removed but metadata retained');

    const extraCredit = {
      actorId: testUser.id, userId: testUser.id, credits: 3,
      caseReference: `M4-LEASE-${suffix}`, reason: 'M4 release integration fixture',
      idempotencyKey: `m4-release-grant-${suffix}`,
    };
    await billingService.grantGoodwill(extraCredit);
    const releaseOperation = await operationService.createAndReserve({
      ...durableInput,
      inputFingerprint: require('node:crypto').createHash('sha256').update(`release-operation:${suffix}`).digest('hex'),
      inputSnapshotRef: `document:release:${cvDocumentId}`,
      idempotencyKey: `durable-release-${suffix}`,
    });
    durableOperationIds.push(releaseOperation.operation._id);
    durableEvaluationIds.push(releaseOperation.operation.resourceId);
    const releaseToken = `release-worker-${suffix}`;
    const walletBeforeRelease = (await billingService.getWallet(testUser.id)).wallet;
    await operationService.claimLease(String(releaseOperation.operation._id), releaseToken);
    await operationService.releaseTerminal(String(releaseOperation.operation._id), 'test_failure', releaseToken);
    const releaseLedgerCount = await mongoose.model('CreditLedger').countDocuments({ operationId: releaseOperation.operation._id, eventType: 'release_ai' });
    await operationService.releaseTerminal(String(releaseOperation.operation._id), 'test_failure', releaseToken);
    assert.equal(await mongoose.model('CreditLedger').countDocuments({ operationId: releaseOperation.operation._id, eventType: 'release_ai' }), releaseLedgerCount);
    const finalWallet = await billingService.getWallet(testUser.id);
    assert.equal(finalWallet.wallet.availableCredits, walletBeforeRelease.availableCredits + 3);
    assert.equal(finalWallet.wallet.reservedCredits, walletBeforeRelease.reservedCredits - 3);
    assert.ok(finalWallet.wallet.availableCredits >= 0);
    assert.ok(finalWallet.wallet.reservedCredits >= 0);
    assert.equal(finalWallet.consistent, true);

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
        'ai_operations', 'idempotency_records', 'evaluations',
      ]) {
        await db.collection(collection).deleteMany({ userId: { $in: userIds } });
      }
      if (durableOperationIds.length) {
        await db.collection('evaluations').deleteMany({ _id: { $in: durableEvaluationIds } });
        await db.collection('outbox_events').deleteMany({ entityId: { $in: durableOperationIds } });
        await db.collection('ai_operation_results').deleteMany({ operationId: { $in: durableOperationIds } });
        await db.collection('user_notifications').deleteMany({ entityId: { $in: durableOperationIds } });
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
