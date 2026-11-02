const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const scoring = loadTs('src/features/review/review.scoring.ts');
const { validateReviewAnalysis, CRITERION_IDS } = loadTs('src/features/review/review.validation.ts', { './review.scoring': scoring });
const cv = 'Experience\nOrganized student workshops.\nEducation\nEconomics degree.\nSkills\nExcel and reporting.';
const jd = 'Must have Excel skills. Experience organizing workshops.';
function review() {
  return {
    schemaVersion: 2, feedback: 'Activities and education are clearly described.', missing_information: ['Workshop scope'],
    criteria: CRITERION_IDS.map(id => ({ id, name: id, score: 4, evidenceStatus: 'quoted', evidence: 'Organized student workshops.', section: 'Experience', rationale: 'Specific activity is visible.', suggestion: 'Describe the workshop scope.', priority: 'medium', exampleRevision: 'Organized student workshops for [audience].' })),
    strengths: [{ title: 'Concrete contribution', evidence: 'Organized student workshops.', section: 'Experience' }], requirementMatches: [],
  };
}

test('validated review retains evidence, strengths, priorities and grounded revision examples', () => {
  const result = validateReviewAnalysis(review(), cv);
  assert.equal(scoring.validateAndAggregateReview(result.criteria), 80);
  assert.equal(result.strengths[0].evidence, 'Organized student workshops.');
  assert.equal(result.criteria[0].exampleRevision, 'Organized student workshops for [audience].');
  assert.equal(result.gaps.length, 6);
});

test('unassessable criteria are excluded rather than scored as zero; no assessment cannot produce a score', () => {
  const input = review();
  Object.assign(input.criteria[0], { score: null, evidenceStatus: 'not_assessable', evidence: '' });
  assert.equal(scoring.validateAndAggregateReview(validateReviewAnalysis(input, cv).criteria), 80);
  for (const item of input.criteria) Object.assign(item, { score: null, evidenceStatus: 'not_assessable', evidence: '' });
  assert.throws(() => validateReviewAnalysis(input, cv), /No criteria could be assessed/);
});

test('duplicate or missing criteria, fabricated quotes, invalid scores and priorities are rejected', () => {
  const mutations = [
    r => r.criteria.pop(), r => r.criteria.push({ ...r.criteria[0] }),
    r => r.criteria[1].id = r.criteria[0].id, r => r.criteria[0].id = 'random',
    r => r.criteria[0].evidence = 'Increased revenue by 80%',
    r => r.strengths[0].evidence = 'Managed a team of 100',
    r => r.criteria[0].score = null, r => r.criteria[0].score = NaN,
    r => r.criteria[0].score = 6, r => r.criteria[0].priority = 'urgent',
    r => r.criteria[0].evidenceStatus = 'unknown', r => delete r.criteria[0].rationale,
  ];
  for (const mutate of mutations) { const input = review(); mutate(input); assert.throws(() => validateReviewAnalysis(input, cv), /incomplete review/); }
});

test('quote verification tolerates extraction whitespace without accepting changed facts', () => {
  const input = review(); input.criteria[0].evidence = 'Organized\nstudent  workshops.';
  assert.equal(validateReviewAnalysis(input, cv).criteria.length, 6);
});

test('general reviews reject job requirements; JD evidence is independently grounded and scored separately', () => {
  const input = review();
  input.requirementMatches = [{ requirement: 'Must have Excel skills.', status: 'supported', evidence: 'Excel and reporting.', explanation: 'Excel is listed.' }];
  assert.throws(() => validateReviewAnalysis(input, cv), /incomplete review/);
  const result = validateReviewAnalysis(input, cv, jd);
  assert.equal(result.requirementMatches[0].status, 'supported');
  assert.equal(scoring.validateAndAggregateReview(result.criteria), 80);
  input.requirementMatches[0].status = 'not_visible'; input.requirementMatches[0].evidence = '';
  assert.equal(scoring.validateAndAggregateReview(validateReviewAnalysis(input, cv, jd).criteria), 80);
  input.requirementMatches[0].requirement = 'Requires AWS certification';
  assert.throws(() => validateReviewAnalysis(input, cv, jd), /incomplete review/);
});

test('JD rejects missing matrix, duplicate requirements and ungrounded supporting CV evidence', () => {
  assert.throws(() => validateReviewAnalysis(review(), cv, jd), /incomplete review/);
  const input = review();
  const match = { requirement: 'Must have Excel skills.', status: 'partial', evidence: 'Excel and reporting.', explanation: 'Skill listed; proficiency not stated.' };
  input.requirementMatches = [match, { ...match }];
  assert.throws(() => validateReviewAnalysis(input, cv, jd), /incomplete review/);
  input.requirementMatches = [{ ...match, evidence: 'Advanced Excel specialist' }];
  assert.throws(() => validateReviewAnalysis(input, cv, jd), /incomplete review/);
});

test('result mapping retains review v2 and unions missing details; general mode suppresses JD content', () => {
  const { mapReviewResult } = loadTs('src/features/review/review.response.ts');
  const analysis = validateReviewAnalysis(review(), cv);
  const result = mapReviewResult({ matchRate: 80, evaluation: analysis }, null, undefined, 'en', { missing_information: ['Workshop scope', 'Dates'], recommendation: 'YES' });
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.strengths.length, 1);
  assert.equal(result.recommendation, '');
  assert.deepEqual(result.missingInformation, ['Workshop scope', 'Dates']);
  assert.deepEqual(result.requirementMatches, []);
});

test('versioned workflow uses validated summary without a second AI generation', async () => {
  const { createReviewWorkflow } = loadTs('src/features/review/review.workflow.ts', { './review.response': loadTs('src/features/review/review.response.ts') });
  const workflow = createReviewWorkflow({
    repository: { markProcessing: async () => true, findJobDescription: async () => null, complete: async () => true, fail: async () => {} },
    evaluator: { evaluate: async () => ({ extractedInfo: { name: 'Example' }, matchRate: 80, evaluation: validateReviewAnalysis(review(), cv) }) },
    summary: { generateFinalSummary: async () => { throw new Error('Unexpected second generation'); } },
  });
  const result = await workflow.process({ evaluationId: 'review-2', cvDocumentId: 'cv', locale: 'id' });
  assert.equal(result.overallSummary, review().feedback);
  assert.equal(result.locale, 'id');
});

test('MongoDB schema preserves versioned evidence and nullable scores without requiring migration of old records', () => {
  const Evaluation = loadTs('src/models/evaluation.model.ts').default;
  const input = review();
  Object.assign(input.criteria[0], { score: null, evidenceStatus: 'not_assessable', evidence: '' });
  const document = new Evaluation({ cvDocumentId: '000000000000000000000001', result: { ...input, cvMatchRate: 80, overallSummary: input.feedback } });
  const result = document.toObject().result;
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.criteria[0].score, null);
  assert.equal(result.criteria[1].priority, 'medium');
  assert.equal(result.criteria[1].exampleRevision, input.criteria[1].exampleRevision);
  assert.equal(result.strengths[0].section, 'Experience');
  const legacy = new Evaluation({ result: { cvMatchRate: 60, criteria: [{ name: 'Old criterion', score: 3, evidence: 'Old evidence', suggestion: 'Old suggestion' }] } }).toObject();
  assert.equal(legacy.result.criteria[0].score, 3);
  assert.equal(legacy.result.schemaVersion, undefined);
});

test('invalid AI output gets one bounded correction with original source; repeated invalid output fails', async () => {
  const { logger } = require('./helpers/load-ts.cjs');
  const calls = [];
  let responses = ['{"schemaVersion":2', JSON.stringify(review())];
  const { ReviewAIService } = loadTs('src/features/review/review.ai.ts', {
    '../../utils/logger': logger,
    '../../utils/locale': { outputLanguage: () => 'English' },
    './review.prompts': loadTs('src/features/review/review.prompts.ts'),
    './review.validation': { validateReviewAnalysis },
    '../../services/llm/json-response': loadTs('src/services/llm/json-response.ts', { '../../utils/logger': logger }),
    '../../services/llm/openai.service': { completion: async prompt => { calls.push(prompt); return responses.shift(); } },
  });
  const service = new ReviewAIService();
  const result = await service.evaluateCV({ sourceText: cv }, { mode: 'general', locale: 'en' });
  assert.equal(result.schemaVersion, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes(JSON.stringify(cv)));
  assert.ok(calls[1].includes('previous response failed validation'));
  calls.length = 0; responses = ['{}', '{}'];
  await assert.rejects(service.evaluateCV({ sourceText: cv }, { mode: 'general' }), /incomplete review/);
  assert.equal(calls.length, 2);
});
