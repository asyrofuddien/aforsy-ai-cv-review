const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

const criteria = () => Array.from({ length: 6 }, (_, i) => ({ name: `Criterion ${i}`, score: 3.25, evidence: 'Source quote', suggestion: 'Clarify impact' }));
function fixture({ output = criteria(), content = 'Original synthetic CV', job = null } = {}) {
  const calls = [];
  const evaluator = loadTs('src/services/evaluation/cv.evaluator.ts', {
    '../../utils/logger': logger,
    '../../models/document.model': { findById: async () => ({ content }) },
    '../../models/jobDescription.model': { findById: async () => job },
    '../llm/chains': {
      extractCVInfo: async () => ({ name: 'Synthetic Candidate', skills: [] }),
      evaluateCV: async (info, requirements) => { calls.push({ info, requirements }); return { criteria: output, feedback: 'Synthetic feedback' }; },
    },
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
