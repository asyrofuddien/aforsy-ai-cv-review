const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

const criteria = () => Array.from({ length: 6 }, (_, i) => ({ name: `Criterion ${i}`, score: 3.25, evidence: 'Source quote', suggestion: 'Clarify impact' }));

test('review retry can reclaim a processing record when retry-state recovery did not persist', async () => {
  const updates = [];
  const { reviewRepository } = loadTs('src/features/review/review.repository.ts', {
    '../../models/document.model': {},
    '../../models/user.model': {},
    '../../models/evaluation.model': { findOneAndUpdate: async (...args) => updates.push(args) },
    '../../models/jobDescription.model': {},
  });
  await reviewRepository.markProcessing('review-1', false);
  await reviewRepository.markProcessing('review-1', true);
  assert.deepEqual(updates.map(([filter]) => filter.status.$in), [
    ['queued', 'failed'],
    ['queued', 'failed', 'processing'],
  ]);
});

function fixture({ output = criteria(), content = 'Original synthetic CV', job = null } = {}) {
  const calls = [];
  const evaluator = loadTs('src/services/evaluation/cv.evaluator.ts', {
    '../../utils/logger': logger,
    '../../features/review/review.scoring': loadTs('src/features/review/review.scoring.ts'),
    '../../features/review/review.repository': { reviewRepository: {
      findCvDocument: async () => ({ content }),
      findJobDescription: async () => job,
    } },
    '../../features/review/review.ai': { ReviewAIService: class {
      extractCVInfo = async () => ({ name: 'Synthetic Candidate', skills: [] });
      evaluateCV = async (info, requirements) => { calls.push({ info, requirements }); return { criteria: output, feedback: 'Synthetic feedback' }; };
    } },
  }).default;
  return { evaluator, calls };
}

test('general review retains source evidence and computes equal-weight aggregate', async () => {
  const { evaluator, calls } = fixture();
  const result = await evaluator.evaluate('cv');
  assert.equal(result.matchRate, 65);
  assert.equal(calls[0].requirements.mode, 'general');
  assert.equal(calls[0].info.sourceText, 'Original synthetic CV');
  assert.equal(result.evaluation.criteria[0].evidence, 'Source quote');
});

test('pasted and saved job descriptions select job-specific mode with requested locale', async () => {
  const pasted = fixture();
  await pasted.evaluator.evaluate('cv', undefined, 'Required Node.js', 'id');
  assert.equal(pasted.calls[0].requirements.description, 'Required Node.js');
  assert.equal(pasted.calls[0].requirements.mode, 'job_specific');
  assert.equal(pasted.calls[0].requirements.locale, 'id');
  const saved = fixture({ job: { title: 'Engineer', company: 'Example', description: 'Saved requirements', requirements: { technical: ['TypeScript'] } } });
  await saved.evaluator.evaluate('cv', 'job-id', undefined, 'en');
  assert.equal(saved.calls[0].requirements.description, 'Saved requirements');
  assert.equal(saved.calls[0].requirements.mode, 'job_specific');
});

test('incomplete, out-of-range and non-finite AI criteria fail without a fabricated score', async () => {
  for (const output of [criteria().slice(1), [{ ...criteria()[0], score: NaN }, ...criteria().slice(1)], [{ ...criteria()[0], score: 6 }, ...criteria().slice(1)], [{ name: 'No evidence', score: 4 }, ...criteria().slice(1)]]) {
    await assert.rejects(fixture({ output }).evaluator.evaluate('cv'), /incomplete review/);
  }
});

test('unreadable document and missing saved job fail before evaluation', async () => {
  const unreadable = fixture({ content: '  ' });
  await assert.rejects(unreadable.evaluator.evaluate('cv'), /no readable text/);
  assert.equal(unreadable.calls.length, 0);
  const missing = fixture();
  await assert.rejects(missing.evaluator.evaluate('cv', 'missing-job'), /Job description not found/);
  assert.equal(missing.calls.length, 0);
});

test('review workflow is dependency-injected, selects mode and persists mapped result', async () => {
  const { createReviewWorkflow } = loadTs('src/features/review/review.workflow.ts', {
    './review.response': loadTs('src/features/review/review.response.ts'),
  });
  const calls = [];
  const workflow = createReviewWorkflow({
    repository: {
      markProcessing: async id => calls.push(['processing', id]),
      findJobDescription: async id => id ? { id, title: 'Engineer', company: 'Example', description: 'Build services', requirements: { technical: ['Node'] }, scoringWeights: { skills: 1 } } : null,
      complete: async (...args) => calls.push(['complete', ...args]),
      fail: async (...args) => calls.push(['fail', ...args]),
    },
    evaluator: { evaluate: async (...args) => ({ extractedInfo: { name: 'Synthetic Person' }, matchRate: 80, evaluation: { criteria: criteria(), feedback: 'Evidence based' } }) },
    summary: { generateFinalSummary: async (_result, mode, locale) => { calls.push(['summary', mode, locale]); return { overall_summary: 'Review summary', recommendation: 'YES' }; } },
  });
  const result = await workflow.process({ evaluationId: 'evaluation-1', cvDocumentId: 'cv-1', locale: 'id' });
  assert.equal(result.mode, 'general');
  assert.equal(result.recommendation, '');
  assert.equal(result.locale, 'id');
  assert.deepEqual(calls[0], ['processing', 'evaluation-1']);
  assert.deepEqual(calls[1], ['summary', 'general', 'id']);
  assert.equal(calls[2][1], 'evaluation-1');
  assert.equal(calls[2][2], 'Synthetic Person');
});

test('review workflow records terminal failure and rethrows for queue retry', async () => {
  const { createReviewWorkflow } = loadTs('src/features/review/review.workflow.ts', {
    './review.response': loadTs('src/features/review/review.response.ts'),
  });
  const calls = [];
  const workflow = createReviewWorkflow({
    repository: {
      markProcessing: async () => {}, findJobDescription: async () => null,
      complete: async () => {}, fail: async (...args) => calls.push(args),
    },
    evaluator: { evaluate: async () => { throw new Error('AI output invalid'); } },
    summary: { generateFinalSummary: async () => ({}) },
  });
  await assert.rejects(workflow.process({ evaluationId: 'evaluation-2', cvDocumentId: 'cv-2' }), /AI output invalid/);
  assert.deepEqual(calls, [['evaluation-2', 'AI output invalid']]);
});

test('job matching runs inside the review workflow and persists results into review history', async () => {
  const { createReviewWorkflow } = loadTs('src/features/review/review.workflow.ts', {
    './review.response': loadTs('src/features/review/review.response.ts'),
  });
  const calls = [];
  const logs = [];
  const workflow = createReviewWorkflow({
    repository: {
      markProcessing: async () => {}, findJobDescription: async () => null,
      complete: async (...args) => calls.push(['complete', ...args]), fail: async (...args) => calls.push(['fail', ...args]),
    },
    evaluator: { evaluate: async () => ({ extractedInfo: { name: 'Synthetic Person', skills: ['TypeScript'] }, matchRate: 80, evaluation: { criteria: criteria(), feedback: 'Review is ready' } }) },
    summary: { generateFinalSummary: async () => ({}) },
    jobMatcher: { findMatches: async profile => { calls.push(['match', profile]); return { suggestedRoles: ['Backend Developer'], jobs: [{ title: 'Engineer', score: 82 }] }; } },
    logger: { info: (message, metadata) => logs.push([message, metadata]), error() {}, warn() {} },
  });
  const result = await workflow.process({ evaluationId: 'evaluation-match', cvDocumentId: 'cv-1' });
  assert.equal(result.jobMatchingStatus, 'completed');
  assert.deepEqual(result.suggestedRoles, ['Backend Developer']);
  assert.deepEqual(result.jobMatches, [{ title: 'Engineer', score: 82 }]);
  assert.equal(calls[0][0], 'match');
  assert.equal(calls[1][0], 'complete');
  assert.ok(logs.some(([message, metadata]) => message === 'Review stage started' && metadata.stage === 'analyze CV'));
  assert.ok(logs.some(([message, metadata]) => message === 'Review stage completed' && metadata.stage === 'suggest roles, search jobs, and score matches'));
  assert.ok(logs.some(([message]) => message === 'Review workflow completed'));
});

test('job matching failure leaves a successful CV review completed and reports the matching error', async () => {
  const { createReviewWorkflow } = loadTs('src/features/review/review.workflow.ts', {
    './review.response': loadTs('src/features/review/review.response.ts'),
  });
  const calls = [];
  const workflow = createReviewWorkflow({
    repository: {
      markProcessing: async () => {}, findJobDescription: async () => null,
      complete: async (...args) => calls.push(['complete', ...args]), fail: async (...args) => calls.push(['fail', ...args]),
    },
    evaluator: { evaluate: async () => ({ extractedInfo: { name: 'Synthetic Person' }, matchRate: 80, evaluation: { criteria: criteria(), feedback: 'Review is ready' } }) },
    summary: { generateFinalSummary: async () => ({}) },
    jobMatcher: { findMatches: async () => { throw new Error('All configured providers failed'); } },
    logger,
  });
  const result = await workflow.process({ evaluationId: 'evaluation-partial-failure', cvDocumentId: 'cv-1' });
  assert.equal(result.jobMatchingStatus, 'failed');
  assert.deepEqual(result.jobMatches, []);
  assert.match(result.jobMatchingError, /Your CV review is ready/);
  assert.equal(calls[0][0], 'complete');
  assert.equal(calls.some(([type]) => type === 'fail'), false);
});

test('deferred matching saves the review and sends its email before searching jobs', async () => {
  const { createReviewWorkflow } = loadTs('src/features/review/review.workflow.ts', {
    './review.response': loadTs('src/features/review/review.response.ts'),
  });
  const calls = [];
  const workflow = createReviewWorkflow({
    repository: {
      markProcessing: async () => ({}), findJobDescription: async () => null,
      complete: async (_id, _name, result, profile) => { calls.push('saved'); assert.equal(result.jobMatchingStatus, 'processing'); assert.equal(profile.name, 'Synthetic Person'); return {}; },
      fail: async () => { throw new Error('Review should remain ready'); },
    },
    evaluator: { evaluate: async () => ({ extractedInfo: { name: 'Synthetic Person' }, matchRate: 80, evaluation: { criteria: criteria(), feedback: 'Ready' } }) },
    summary: { generateFinalSummary: async () => ({}) },
    jobMatcher: { findMatches: async () => { calls.push('matching'); return { suggestedRoles: [], jobs: [] }; } },
    notifyCompleted: async () => calls.push('email'),
    logger,
  });
  const result = await workflow.process({ evaluationId: 'evaluation-deferred', cvDocumentId: 'cv-1', deferMatching: true });
  assert.equal(result.jobMatchingStatus, 'processing');
  assert.deepEqual(calls, ['saved', 'email']);
});
