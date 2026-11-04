const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

function createService({ maxRetries, createCompletion, context = {} }) {
  const records = [];
  let attempts = 0;
  class MockOpenAI {
    constructor(options) {
      this.options = options;
      this.chat = { completions: { create: async request => {
        attempts += 1;
        return createCompletion(request, attempts);
      } } };
    }
  }
  class AppError extends Error {
    constructor(message, statusCode) { super(message); this.statusCode = statusCode; }
  }
  const { default: service } = loadTs('src/services/llm/openai.service.ts', {
    openai: MockOpenAI,
    '../../config/config': {
      ai: { apiKey: 'fixture-key', baseUrl: 'https://provider.test', model: 'fixture-model', temperature: 0.1, maxRetries, retryDelay: 0 },
    },
    '../../utils/logger': logger,
    '../../middlewares/error.middleware': { AppError },
    '../../models/aiUsage.model': { create: async record => records.push(record) },
    '../../utils/log-context': { logContext: { getStore: () => context } },
  });
  return { service, records, get attempts() { return attempts; } };
}

test('LLM retries are bounded, recorded per attempt, and omit prompt content', async () => {
  const fixture = createService({
    maxRetries: 12,
    createCompletion: (_request, attempt) => {
      if (attempt < 3) throw Object.assign(new Error('sensitive provider message'), { status: 503, code: 'temporarily_unavailable' });
      return {
        model: 'provider-model',
        choices: [{ message: { content: 'result' }, finish_reason: 'stop' }],
        _request_id: 'provider-request',
      };
    },
    context: { evaluationId: '507f1f77bcf86cd799439011' },
  });

  assert.equal(await fixture.service.completion('private CV prompt', { stage: 'review' }), 'result');
  assert.equal(fixture.attempts, 3);
  assert.deepEqual(fixture.records.map(record => [record.attempt, record.status]), [
    [1, 'failed'],
    [2, 'failed'],
    [3, 'succeeded'],
  ]);
  assert.equal(fixture.records[0].failureCode, 'temporarily_unavailable');
  assert.equal(fixture.records[2].usageAvailability, 'unknown');
  assert.equal(fixture.records[2].inputTokens, null);
  assert.equal(fixture.records[2].outputTokens, null);
  assert.ok(fixture.records.every(record => record.callId === fixture.records[0].callId));
  assert.equal(JSON.stringify(fixture.records).includes('private CV prompt'), false);
  assert.equal(JSON.stringify(fixture.records).includes('sensitive provider message'), false);
});

test('reported provider usage is preserved without converting absence to zero', async () => {
  const fixture = createService({
    maxRetries: 1,
    createCompletion: () => ({
      model: 'fixture-model',
      choices: [{ message: { content: 'result' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 17, completion_tokens: 9 },
    }),
  });

  await fixture.service.completion('prompt', { stage: 'matching' });
  assert.equal(fixture.records[0].usageAvailability, 'reported');
  assert.equal(fixture.records[0].inputTokens, 17);
  assert.equal(fixture.records[0].outputTokens, 9);
});

test('truncated review output is rejected before parsing and its failed usage remains metered', async () => {
  const fixture = createService({
    maxRetries: 1,
    createCompletion: () => ({
      model: 'fixture-model',
      choices: [{ message: { content: '{"criteria":[' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 20, completion_tokens: 8000 },
    }),
  });
  await assert.rejects(fixture.service.completion('private CV prompt', { stage: 'cv_evaluation', rejectTruncated: true }), /response was truncated/);
  assert.equal(fixture.records.length, 1);
  assert.equal(fixture.records[0].status, 'failed');
  assert.equal(fixture.records[0].failureCode, 'response_truncated');
  assert.equal(fixture.records[0].outputTokens, 8000);
});
