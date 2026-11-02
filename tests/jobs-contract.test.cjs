const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

const { RapidApiJobProvider } = loadTs('src/features/jobs/providers/rapidapi.adapter.ts');
const { JobParser } = loadTs('src/features/jobs/model/job.parser.ts');
const scoring = loadTs('src/features/jobs/model/job.scoring.ts', { '../../../utils/logger': logger });

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('RapidAPI adapter requires an explicit key and keeps HTTP requests out of unconfigured fallback', async () => {
  let calls = 0;
  const provider = new RapidApiJobProvider({ apiKey: '' }, async () => { calls += 1; return response(200, {}); });
  await assert.rejects(provider.search({ query: 'Backend Engineer' }), /not configured/);
  assert.equal(calls, 0);
});

test('RapidAPI adapter maps query parameters, headers, detail lookup and retries 429 with legacy backoff', async () => {
  const calls = [], delays = [];
  const provider = new RapidApiJobProvider({ apiKey: 'fixture-key', apiHost: 'fixture.host', baseUrl: 'https://fixture.test' }, async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? response(429, {}) : response(200, { data: [{ id: 'job-1' }] });
  }, async delay => delays.push(delay));
  const result = await provider.search({ query: 'Backend Engineer', experienceLevels: 'associate;midSenior', location: 'Indonesia' });
  assert.equal(result.data[0].id, 'job-1');
  assert.deepEqual(delays, [2000]);
  assert.match(calls[1].url, /query=Backend\+Engineer/);
  assert.equal(calls[1].init.headers['x-rapidapi-key'], 'fixture-key');
});

test('provider detail failures preserve the existing null detail fallback', async () => {
  const provider = new RapidApiJobProvider({ apiKey: 'fixture' }, async () => response(503, {}));
  assert.equal(await provider.getDetails('job-1'), null);
});

test('job parser preserves requirements extraction, defaults, seniority normalization and posting date handling', () => {
  const parser = new JobParser();
  const parsed = parser.parseProviderDetails({ data: {
    title: 'Senior Engineer', companyName: 'Example', location: 'Jakarta', seniorityLevel: 'Senior',
    employmentType: 'Full-time', datePosted: '2026-10-01', description: 'Qualifications\n- Build reliable typed systems for customers\nResponsibilities\n- Build reliable services for customers', linkedinUrl: 'https://jobs.test/1',
  } });
  assert.deepEqual(parsed.requirements, ['Build reliable typed systems for customers']);
  assert.deepEqual(parsed.responsibilities, ['Build reliable services for customers']);
  assert.equal(parsed.seniority, 'Senior');
  assert.equal(parsed.posted_at, '2026-10-01');
  assert.equal(parser.parseProviderDetails({ data: { title: 'Role' } }).company, 'Unknown company');
});

test('scoring keeps grade boundaries, formula, score rounding and top-five ordering', async () => {
  assert.deepEqual([39.99, 40, 55, 70, 85].map(scoring.getGrade), ['F', 'D', 'C', 'B', 'A']);
  assert.equal(scoring.calculateExperienceMatch('Senior', 'Senior'), 100);
  assert.equal(scoring.calculateExperienceMatch('Entry-level', 'Lead'), 10);
  const jobs = Array.from({ length: 7 }, (_, index) => ({ title: `job-${index}`, company: 'Fixture', location: 'Indonesia', salary_range: '', job_type: '', requirements: ['Node.js'], responsibilities: [], posted_at: '', link: '', seniority: 'Mid-level' }));
  const matched = await scoring.matchJobs({ skills: ['Node.js'], seniority: 'Mid-level', work_experience: [] }, jobs, async () => 80);
  assert.equal(matched.length, 5);
  assert.equal(matched[0].skill_match, 80);
  assert.equal(matched[0].score, 60);
  assert.equal(matched[0].grade, 'C');
});
