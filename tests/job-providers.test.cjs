const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const metricUpdates = [];
let metricContext;

const providers = loadTs('src/features/jobs/providers/ats.adapter.ts', {
  './rapidapi.adapter': { rapidApiJobProvider: { search: async () => ({ data: [] }), getDetails: async () => null } },
  '../../../config/config': { jobs: { provider: 'rapidapi', fallback: 'aggregate', greenhouseBoards: [], leverSites: [] } },
});
const { JobsService } = loadTs('src/features/jobs/jobs.service.ts', {
  '../../utils/logger': { child() { return { warn() {}, debug() {}, info() {}, error() {} }; } },
  '../../config/config': { jobs: { provider: 'test' } },
  '../../models/jobOperationMetric.model': { findOneAndUpdate: async (...args) => metricUpdates.push(args) },
  '../../utils/log-context': { logContext: { getStore: () => metricContext } },
  './jobs.ai': { JobsAIService: class { beautifyDescription = async description => ({ description }); calculateSkillmatch = async () => ({ score: 0 }); } },
  './providers/ats.adapter': { configuredJobProvider: {} },
  './model/job.parser': { JobParser: class { parseProviderDetails = detail => ({ title: detail.data.title, company: 'Test', requirements: [], responsibilities: [], job_description: detail.data.description, location: 'Remote', seniority: 'Mid-level', posted_at: '', link: '', salary_range: '', job_type: '' }); } },
  './model/job.scoring': { calculateSkillMatch: async () => 0, matchJobs: async () => [], SkillMatcher: class {} },
});
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('Greenhouse adapter filters board jobs, normalizes details, and strips HTML', async () => {
  const provider = new providers.GreenhouseJobProvider(['sample'], async url => {
    assert.match(url, /boards\/sample\/jobs\?content=true/);
    return response({ jobs: [{ id: 7, title: 'Backend Engineer', content: '<p>Build APIs &amp; services</p>', absolute_url: 'https://jobs.test/7', location: { name: 'Jakarta' } }] });
  });
  const found = await provider.search({ query: 'Backend Engineer' });
  const detail = await provider.getDetails(found.data[0].id);
  assert.equal(detail.data.title, 'Backend Engineer');
  assert.equal(detail.data.description, 'Build APIs & services');
  assert.equal(detail.data.location, 'Jakarta');
});

test('Lever adapter normalizes postings and preserves hosted application URL', async () => {
  const provider = new providers.LeverJobProvider(['sample'], async () => response([{ id: 'post-1', text: 'Data Analyst', descriptionPlain: '<p>Analyze customer data</p>', hostedUrl: 'https://jobs.test/post-1', categories: { location: 'Remote', commitment: 'Full-time' } }]));
  const found = await provider.search({ query: 'Data Analyst' });
  const detail = await provider.getDetails(found.data[0].id);
  assert.equal(detail.data.title, 'Data Analyst');
  assert.equal(detail.data.description, 'Analyze customer data');
  assert.equal(detail.data.linkedinUrl, 'https://jobs.test/post-1');
});

test('an unavailable ATS board does not discard successful boards from the same provider', async () => {
  const provider = new providers.GreenhouseJobProvider(['broken', 'working'], async url => {
    if (url.includes('/broken/')) return response({}, 503);
    return response({ jobs: [{ id: 8, title: 'Platform Engineer', content: 'Build infrastructure' }] });
  });
  const result = await provider.search({ query: 'Platform Engineer' });
  assert.deepEqual(result.data, [{ id: 'greenhouse:working:8' }]);
});

test('RapidAPI fallback uses ATS results after primary failure and keeps partial aggregate success', async () => {
  const primary = { search: async () => { throw new Error('RapidAPI unavailable'); }, getDetails: async () => null };
  const atsJob = { id: 'greenhouse:sample:7' };
  const fallback = { search: async () => ({ data: [atsJob] }), getDetails: async id => ({ data: { title: id } }) };
  const provider = new providers.RapidApiFallbackProvider(primary, fallback);
  const result = await provider.search({ query: 'Engineer' });
  assert.equal(result.data[0].id, 'aggregate:greenhouse:sample:7');
  assert.deepEqual(await provider.getDetails(result.data[0].id), { data: { title: 'greenhouse:sample:7' } });
});

test('aggregate continues on one source failure and fails when every configured source fails', async () => {
  const okay = { search: async () => ({ data: [{ id: 'job-1' }] }), getDetails: async () => null };
  const broken = { search: async () => { throw new Error('source down'); }, getDetails: async () => null };
  assert.deepEqual(await new providers.AggregateJobProvider([broken, okay]).search({ query: 'Engineer' }), { data: [{ id: 'job-1' }] });
  await assert.rejects(new providers.AggregateJobProvider([broken]).search({ query: 'Engineer' }), /All job providers failed/);
});

test('RapidAPI detail fallback reuses the original search profile when requests overlap', async () => {
  const seen = [];
  const primary = { search: async () => ({ data: [{ id: 'rapid-1' }] }), getDetails: async () => null };
  const fallback = { search: async params => { seen.push(params.query); return { data: [{ id: `greenhouse:${params.query}:1` }] }; }, getDetails: async id => ({ data: { title: id } }) };
  const provider = new providers.RapidApiFallbackProvider(primary, fallback);
  const first = await provider.search({ query: 'Designer' });
  await provider.search({ query: 'Engineer' });
  await provider.getDetails(first.data[0].id);
  assert.deepEqual(seen, ['Designer']);
});

test('all-provider failure fails the matcher instead of returning synthetic jobs; successful role results survive partial failure', async () => {
  const dependencies = { parser: { parseProviderDetails: detail => ({ title: detail.data.title, company: 'Test', requirements: [], responsibilities: [], job_description: detail.data.description, location: 'Remote', seniority: 'Mid-level', posted_at: '', link: '', salary_range: '', job_type: '' }) }, enhance: { beautifyDescription: async description => ({ description }) }, skillMatch: async () => 0 };
  const failed = new JobsService({ search: async () => { throw new Error('all providers down'); }, getDetails: async () => null }, dependencies.parser, dependencies.enhance, dependencies.skillMatch);
  await assert.rejects(failed.findJobs({ suggested_roles: ['Engineer'], seniority: 'Mid-level' }), /Job matching could not run/);

  const partial = new JobsService({
    search: async ({ query }) => { if (query === 'Designer') throw new Error('one source failed'); return { data: [{ id: 'job-1' }] }; },
    getDetails: async () => ({ data: { title: 'Engineer', description: 'Build systems' } }),
  }, dependencies.parser, dependencies.enhance, dependencies.skillMatch);
  const jobs = await partial.findJobs({ suggested_roles: ['Designer', 'Engineer'], seniority: 'Mid-level' });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Engineer');
});

test('job matching metrics preserve bounded fan-out and report duplicate and fallback counts', async () => {
  metricUpdates.length = 0;
  metricContext = { evaluationId: '507f1f77bcf86cd799439011', attempt: '2' };
  const provider = {
    search: async () => ({ data: Array.from({ length: 4 }, (_, i) => ({ id: `job-${i}` })) }),
    getDetails: async () => ({ data: { title: 'Same job', description: 'Details' } }),
  };
  const service = new JobsService(
    provider,
    { parseProviderDetails: detail => ({
      title: detail.data.title, company: 'Test', requirements: [], responsibilities: [],
      job_description: detail.data.description, location: 'Remote', seniority: 'Mid-level',
      posted_at: '', link: '', salary_range: '', job_type: '',
    }) },
    { beautifyDescription: async description => ({ description, fallback: true }) },
    async () => 50,
  );

  await service.findJobs({
    suggested_roles: ['Engineer', 'Designer', 'Analyst', 'Unbounded role'],
    seniority: 'Mid-level',
  });

  assert.equal(metricUpdates.length, 1);
  const [filter, update] = metricUpdates[0];
  assert.deepEqual(filter, {
    referenceType: 'evaluation',
    referenceId: '507f1f77bcf86cd799439011',
    stage: 'search',
    attempt: 2,
  });
  assert.equal(update.$set.status, 'completed');
  assert.equal(update.$set.provider, 'test');
  assert.ok(update.$set.durationMs >= 0);
  assert.deepEqual(
    Object.fromEntries(Object.entries(update.$set).filter(([key]) => key !== 'durationMs')),
    {
      status: 'completed',
      provider: 'test',
      roleCount: 3,
      searchAttempts: 3,
      searchSucceeded: 3,
      searchFailed: 0,
      listingsFound: 12,
      detailAttempts: 9,
      detailUnavailable: 0,
      detailFailed: 0,
      listingsDeduplicated: 8,
      enhancementFallbacks: 1,
      listingsReadyForScoring: 1,
    },
  );
});

test('healthy zero results and provider outage receive distinct coverage statuses', async () => {
  metricUpdates.length = 0;
  metricContext = { cvMatcherId: '507f1f77bcf86cd799439012', attempt: '1' };
  const service = (search) => new JobsService(
    { search, getDetails: async () => null },
    { parseProviderDetails: () => ({}) },
    { beautifyDescription: async description => ({ description }) },
  );

  await service(async () => ({ data: [] })).findJobs({
    suggested_roles: ['Engineer'],
    seniority: 'Mid-level',
  });
  await assert.rejects(service(async () => { throw new Error('unavailable'); })
    .findJobs({ suggested_roles: ['Engineer'], seniority: 'Mid-level' }), /every search failed/);

  assert.deepEqual(metricUpdates.map(([, update]) => update.$set.status), [
    'no_matches',
    'failed',
  ]);
  metricContext = undefined;
});
