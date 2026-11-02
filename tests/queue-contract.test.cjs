const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const { enqueueWithCompensation } = loadTs('src/features/queue/enqueue.ts');

test('enqueue failure compensates the persisted record and preserves the transport error', async () => {
  const calls = [];
  const error = new Error('redis unavailable');
  await assert.rejects(enqueueWithCompensation({
    record: { id: 'review-1' },
    enqueue: async () => { throw error; },
    compensate: async (record, reason) => calls.push([record.id, reason.message]),
  }), /redis unavailable/);
  assert.deepEqual(calls, [['review-1', 'redis unavailable']]);
});

test('successful enqueue does not run compensation', async () => {
  let compensated = false;
  const result = await enqueueWithCompensation({
    record: { id: 'review-2' },
    enqueue: async () => ({ id: 'review-2' }),
    compensate: async () => { compensated = true; },
  });
  assert.deepEqual(result, { id: 'review-2' });
  assert.equal(compensated, false);
});
