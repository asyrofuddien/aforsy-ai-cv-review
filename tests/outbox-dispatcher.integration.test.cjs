const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

const mongoUri = process.env.MONGODB_TEST_URI;
const redisUrl = process.env.REDIS_TEST_URL;
const enabled = Boolean(mongoUri && redisUrl);

test('outbox delivery is recoverable and duplicate BullMQ job IDs stay idempotent', {
  skip: !enabled ? 'requires isolated MONGODB_TEST_URI and REDIS_TEST_URL' : false,
}, async () => {
  const dbName = new URL(mongoUri).pathname.slice(1);
  assert.match(dbName, /(?:^|[-_])test(?:$|[-_])/i, 'MONGODB_TEST_URI must select a test database');
  assert.match(dbName, /(?:^|[-_])staging(?:$|[-_])/i, 'MONGODB_TEST_URI must use an isolated staging-named test database');
  await mongoose.connect(mongoUri);
  const suffix = `${process.pid}_${Date.now()}`;
  const operationId = new mongoose.Types.ObjectId();
  let queueService;
  let dispatcher;
  const models = loadTs('src/models/billing.models.ts');
  try {
    await models.AiOperation.create({
      _id: operationId, userId: new mongoose.Types.ObjectId(), action: 'ai_draft', status: 'queued',
      billingMode: 'credits', costSnapshot: { creditsRequired: 1 }, locale: 'en',
      inputFingerprint: require('node:crypto').createHash('sha256').update(suffix).digest('hex'),
      inputSnapshotRef: `test:${suffix}`, attemptCount: 0, maxAttempts: 2, stateVersion: 0,
    });
    const eventKey = `m4-outbox:${suffix}`;
    const event = await models.OutboxEvent.create({
      eventKey, type: 'ai-operation.enqueue', entityId: operationId,
      payload: { operationId: String(operationId) }, state: 'processing', attempts: 0,
      nextAttemptAt: new Date(0), lockedUntil: new Date(0),
    });

    const queueLogger = { ...logger, debug() {}, error() {} };
    queueService = loadTs('src/services/queue.service.ts', {
      '../utils/logger': queueLogger,
      '../features/queue/queue.repository': {},
      '../features/queue/enqueue': {},
    }).default;
    const { OutboxDispatcher } = loadTs('src/workers/outbox.dispatcher.ts', {
      '../models/billing.models': models,
      '../features/ai-operations/operation.service': { operationService: { releaseTerminal: async () => {} } },
      '../services/queue.service': { __esModule: true, default: queueService },
      '../utils/logger': queueLogger,
    });
    dispatcher = new OutboxDispatcher();

    // Expired processing lock is reclaimed and delivered to the real BullMQ queue.
    await dispatcher.tick();
    const queue = queueService.aiOperationQueue;
    const job = await queue.getJob(String(operationId));
    assert.ok(job, 'job should be added to BullMQ with operationId as jobId');
    assert.equal(job.id, String(operationId));
    assert.equal(await job.getState(), 'waiting');
    assert.equal((await models.OutboxEvent.findById(event._id)).state, 'delivered');

    // Simulate crash after enqueue but before acknowledgment. Redelivery must find
    // the existing waiting job and must not create a second job with a new ID.
    await models.OutboxEvent.updateOne({ _id: event._id }, {
      $set: { state: 'processing', lockedUntil: new Date(0) },
    });
    await dispatcher.tick();
    assert.equal(await queue.getJobCounts('waiting'), 1);
    assert.equal(await models.OutboxEvent.countDocuments({ eventKey }), 1);
  } finally {
    if (queueService?.aiOperationQueue) {
      const job = await queueService.aiOperationQueue.getJob(String(operationId));
      if (job) await job.remove();
    }
    if (dispatcher) {
      const lease = await mongoose.connection.collection('worker_leases').findOne({ key: 'ai-outbox-dispatcher' });
      if (lease?.owner === dispatcher.owner) await mongoose.connection.collection('worker_leases').deleteOne({ _id: lease._id });
    }
    await models.OutboxEvent.deleteOne({ entityId: operationId });
    await models.AiOperation.deleteOne({ _id: operationId });
    if (queueService) await queueService.close(true);
    await mongoose.disconnect();
  }
});
