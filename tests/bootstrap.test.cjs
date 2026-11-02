const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loadTs } = require('./helpers/load-ts.cjs');

const { createBootstrap } = loadTs('src/bootstrap.ts');
const logger = { info() {}, warn() {}, error() {} };

function makeDependencies(overrides = {}) {
  const events = [];
  const server = {
    close(callback) { events.push('server'); callback(); },
    closeAllConnections() { events.push('server-force'); },
  };
  const dependencies = {
    prepareFilesystem: async () => events.push('filesystem'),
    connectDatabase: async () => events.push('connect-db'),
    initializeVectorDB: async () => events.push('init-vector'),
    startWorkers: async () => events.push('start-workers'),
    listen: async () => { events.push('listen'); return server; },
    closeWorkers: async force => events.push(force ? 'workers-force' : 'workers'),
    closeVectorDB: async () => events.push('vector'),
    disconnectDatabase: async () => events.push('disconnect-db'),
    logger,
    gracefulTimeoutMs: 50,
    forceTimeoutMs: 50,
    ...overrides,
  };
  return { dependencies, events, server };
}

test('bootstrap starts resources in order and shuts them down in reverse dependency order', async () => {
  const fixture = makeDependencies();
  const runtime = createBootstrap(fixture.dependencies);
  await runtime.start();
  await runtime.shutdown('test');
  assert.deepEqual(fixture.events, ['filesystem', 'connect-db', 'init-vector', 'start-workers', 'listen', 'server', 'workers', 'vector', 'disconnect-db']);
});

test('startup failure cleans up resources already opened, including partial worker startup', async () => {
  const fixture = makeDependencies({ startWorkers: async () => { throw new Error('worker startup failed'); } });
  const runtime = createBootstrap(fixture.dependencies);
  await assert.rejects(runtime.start(), /worker startup failed/);
  assert.deepEqual(fixture.events, ['filesystem', 'connect-db', 'init-vector', 'workers', 'vector', 'disconnect-db']);
});

test('shutdown forces a timed-out worker close before disconnecting the database', async () => {
  let events;
  const fixture = makeDependencies({ closeWorkers: async force => {
    events.push(force ? 'workers-force' : 'workers');
    if (!force) await new Promise(() => {});
  }, gracefulTimeoutMs: 5, forceTimeoutMs: 50 });
  events = fixture.events;
  const runtime = createBootstrap(fixture.dependencies);
  await runtime.start();
  await runtime.shutdown('timeout-test');
  assert.ok(fixture.events.indexOf('workers-force') < fixture.events.indexOf('disconnect-db'));
});

test('SIGTERM and SIGINT initiate the same idempotent shutdown path', async () => {
  const fixture = makeDependencies();
  const runtime = createBootstrap(fixture.dependencies);
  const signals = new EventEmitter();
  await runtime.start();
  runtime.installSignalHandlers(signals);
  signals.emit('SIGTERM');
  signals.emit('SIGINT');
  await runtime.shutdown('await-test');
  assert.equal(fixture.events.filter(event => event === 'disconnect-db').length, 1);
});

test('importing queue service creates no BullMQ resources before bootstrap initializes workers', async () => {
  const constructions = [];
  class FakeResource {
    constructor(name) { constructions.push(`new:${name}`); }
    on() {}
    async close() { constructions.push('close'); }
    async add() { return { id: 'queued' }; }
  }
  class FakeWorker extends FakeResource { constructor(name) { super(name); } }
  const { default: queueService } = loadTs('src/services/queue.service.ts', {
    bullmq: { Queue: FakeResource, QueueEvents: FakeResource, Worker: FakeWorker },
    '../config/config': { database: { redisUrl: 'redis://localhost:6379' } },
    '../types/evaluation.types': {},
    '../utils/logger': { child() { return { debug() {}, error() {} }; } },
    '../features/queue/queue.types': {},
    '../features/queue/queue.repository': { queueRepository: {} },
    '../features/queue/enqueue': { enqueueWithCompensation: async input => input.enqueue() },
  });
  assert.deepEqual(constructions, []);
  queueService.initializeEvaluationWorker(async () => undefined);
  assert.ok(constructions.some(value => value === 'new:evaluation-queue'));
  await queueService.close();
});
