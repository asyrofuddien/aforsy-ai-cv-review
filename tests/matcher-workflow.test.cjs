const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

const { createMatcherWorkflow } = loadTs('src/features/cv-matcher/matcher.workflow.ts');

function fixture(overrides = {}) {
  const calls = [];
  const base = {
    repository: {
      markProcessing: async id => calls.push(['processing', id]),
      findDocument: async () => ({ filename: 'synthetic_candidate.pdf', path: '/tmp/cv.pdf', mimeType: 'application/pdf', content: 'cached CV text' }),
      setCandidateName: async (...args) => calls.push(['name', ...args]),
      complete: async (...args) => calls.push(['complete', ...args]),
      fail: async (...args) => calls.push(['failed', ...args]),
    },
    parser: { parseFile: async () => 'parsed CV text' },
    ai: {
      extractCVToJSON: async () => ({ name: 'Synthetic Candidate', skills: ['Node.js'] }),
      RoleSuggestion: async () => ({ suggested_roles: ['Engineer'], seniority: 'Mid-level' }),
      SummaryRecommendation: async () => ({ summary: { strengths: ['Evidence'] } }),
    },
    jobs: {
      findJobs: async () => [{ title: 'Engineer' }],
      matchWithJobs: async () => [{ title: 'Engineer', score: 80 }],
    },
  };
  const dependencies = { ...base, ...overrides, repository: { ...base.repository, ...(overrides.repository || {}) } };
  return { workflow: createMatcherWorkflow(dependencies), calls, dependencies };
}

test('matcher workflow runs explicit parser/AI/jobs stages and preserves response shape', async () => {
  const f = fixture();
  const result = await f.workflow.process({ cvMatcherId: 'matcher-1', cvDocumentId: 'cv-1' });
  assert.deepEqual(result.user_profile, { name: 'Synthetic Candidate', seniority: 'Mid-level', primary_skills: ['Node.js'] });
  assert.deepEqual(result.suggested_roles, ['Engineer']);
  assert.deepEqual(f.calls[0], ['processing', 'matcher-1']);
  assert.equal(f.calls.at(-1)[0], 'complete');
});

test('matcher workflow uses cached text and filename fallback when parser/name extraction fail', async () => {
  const f = fixture({
    parser: { parseFile: async () => { throw new Error('PDF parser unavailable'); } },
    ai: {
      extractCVToJSON: async text => { assert.equal(text, 'cached CV text'); return { name: 'Unknown Candidate', skills: [] }; },
      RoleSuggestion: async () => ({ suggested_roles: [], seniority: 'Mid-level' }),
      SummaryRecommendation: async () => ({ summary: {} }),
    },
  });
  const result = await f.workflow.process({ cvMatcherId: 'matcher-2', cvDocumentId: 'cv-2' });
  assert.equal(result.user_profile.name, 'synthetic candidate');
  assert.ok(f.calls.some(call => call[0] === 'name' && call[2] === 'synthetic candidate'));
});

test('matcher workflow marks failed state and rethrows errors for queue attempts', async () => {
  const f = fixture({ repository: { findDocument: async () => null } });
  await assert.rejects(f.workflow.process({ cvMatcherId: 'matcher-3', cvDocumentId: 'missing' }), /CV Document not found/);
  assert.ok(f.calls.some(call => call[0] === 'failed' && call[1] === 'matcher-3'));
});
