const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

function createReadinessService({ readyState = 1, startTransactionError } = {}) {
  const calls = [];
  let inTransaction = false;
  const session = {
    startTransaction: options => {
      calls.push(['startTransaction', options]);
      if (startTransactionError) throw startTransactionError;
      inTransaction = true;
    },
    inTransaction: () => inTransaction,
    abortTransaction: async () => { calls.push(['abortTransaction']); inTransaction = false; },
    endSession: async () => calls.push(['endSession']),
  };
  const fakeMongoose = {
    connection: {
      readyState,
      db: { collection: name => ({
        findOne: async (filter, options) => {
          calls.push(['findOne', name, filter, options]);
          return null;
        },
      }) },
      startSession: async () => session,
    },
    Types: { ObjectId: class { constructor(value) { this.value = value; } } },
  };
  class AppError extends Error {
    constructor(message, statusCode) { super(message); this.statusCode = statusCode; }
  }
  const { probeMongoTransactions, assertMongoTransactionsReady } = loadTs(
    'src/services/mongo-transaction-readiness.ts',
    {
      mongoose: { __esModule: true, default: fakeMongoose },
      '../middlewares/error.middleware': { AppError },
      '../utils/logger': logger,
    },
  );
  return { calls, probeMongoTransactions, assertMongoTransactionsReady, session };
}

test('transaction readiness uses an aborted read-only transaction', async () => {
  const service = createReadinessService();
  assert.equal(await service.probeMongoTransactions(), true);
  assert.deepEqual(service.calls.map(([name]) => name), [
    'startTransaction', 'findOne', 'abortTransaction', 'endSession',
  ]);
  assert.deepEqual(service.calls[1][1], 'users');
  assert.equal(service.calls[1][3].session, service.session);
  assert.deepEqual(service.calls[1][3].projection, { _id: 1 });
});

test('disconnected MongoDB and standalone transaction errors fail closed', async () => {
  const disconnected = createReadinessService({ readyState: 0 });
  assert.equal(await disconnected.probeMongoTransactions(), false);
  await assert.rejects(disconnected.assertMongoTransactionsReady(), error => error.statusCode === 503);

  const standalone = createReadinessService({ startTransactionError: new Error('transaction numbers are only allowed') });
  assert.equal(await standalone.probeMongoTransactions(), false);
  await assert.rejects(standalone.assertMongoTransactionsReady(), error => error.statusCode === 503);
});
