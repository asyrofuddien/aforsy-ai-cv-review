const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate } = require('node:timers/promises');
const { loadTs, logger, invoke } = require('./helpers/load-ts.cjs');
const { AppError, asyncHandler } = loadTs('src/middlewares/error.middleware.ts', { '../utils/logger': logger });

function fixture(failAt) {
  const files = new Map();
  const calls = { closed: 0, created: [], draftWrites: 0 };
  const fail = (step) => { if (failAt === step) throw new Error(`Synthetic ${step} failure`); };
  const page = {
    target: () => ({ createCDPSession: async () => ({ send: async () => {} }) }),
    setRequestInterception: async () => {}, setViewport: async () => {},
    setContent: async () => { fail('content'); }, evaluateHandle: async () => {},
    pdf: async ({ path }) => { files.set(path, Buffer.from('%PDF-synthetic')); fail('pdf'); },
  };
  const browser = { newPage: async () => page, close: async () => { calls.closed++; } };
  const template = '<html><head><style>body{font-family:Arial;margin:0}</style></head><body><h1>{{name}}{{personalInfo.name}}</h1><h2>Experience</h2></body></html>';
  const drafts = new Map([['owner-a', { data: { personalInfo: { name: 'Owner A' } }, updatedAt: 'synthetic-date' }], ['owner-b', { data: { personalInfo: { name: 'Owner B' } } }]]);
  const draftModel = {
    findOne: ({ userId }) => ({ lean: async () => drafts.get(userId) || null }),
    findOneAndUpdate: async ({ userId }, update) => {
      calls.draftWrites++;
      const value = { data: update.$set.data, updatedAt: 'saved-date' };
      drafts.set(userId, value); return value;
    },
    deleteOne: async ({ userId }) => { drafts.delete(userId); },
  };
  const controller = loadTs('src/controllers/cv-generator.controller.ts', {
    '../utils/logger': logger,
    '../middlewares/error.middleware': { AppError, asyncHandler },
    fs: {
      existsSync: () => true, mkdirSync() {},
      writeFileSync: (name, value) => files.set(name, value),
      readFileSync: name => { assert.ok(files.has(name)); return files.get(name); },
      unlinkSync: name => files.delete(name),
    },
    puppeteer: { launch: async () => { fail('launch'); return browser; } },
    'pdf-parse': async () => { fail('parse'); return { numpages: 1, text: 'Synthetic Candidate' }; },
    '../models/Template.model': { findOne: () => ({ lean: async () => ({ content: template }) }) },
    '../models/cvDraft.model': draftModel,
    '../models/atsTemplate.model': {},
    '../services/atsTemplate.service': { getActiveAtsTemplate: async id => {
      calls.templateId = id;
      return id === 'unavailable' ? null : { layout: { variant: 'classic', pageMargin: '0.4in', headingColor: '#000000', accentColor: '#000000' } };
    } },
    '../models/atsPDF.model': {
      create: async record => {
        fail('create'); calls.created.push(record);
        return { ...record, id: 'synthetic-result', save: async () => { fail('save'); } };
      },
      findOne: ({ userId }) => ({ select: async () => userId === 'owner-a' ? { html_text: '<h1>Owner A</h1>' } : null }),
    },
  }).default;
  return { controller, calls, files, drafts };
}
const request = (body = {}, owner = 'owner-a') => ({ body, query: {}, params: { id: 'synthetic-result' }, authUser: { userId: owner } });

test('draft read/save/delete are scoped to the authenticated owner', async () => {
  const { controller, drafts } = fixture();
  assert.equal((await invoke(controller.GetDraft, request())).body.data.personalInfo.name, 'Owner A');
  await invoke(controller.SaveDraft, request({ personalInfo: { name: 'Edited A' } }));
  assert.equal(drafts.get('owner-b').data.personalInfo.name, 'Owner B');
  await invoke(controller.DeleteDraft, request());
  assert.equal((await invoke(controller.GetDraft, request())).body.data, null);
  assert.ok(drafts.has('owner-b'));
});

test('a queued save for another account is rejected before persistence', async () => {
  const { controller, calls } = fixture();
  const req = request({ personalInfo: { name: 'Old account data' } }, 'owner-b');
  req.query.ownerId = 'owner-a';
  await assert.rejects(invoke(controller.SaveDraft, req), error => error.statusCode === 403);
  assert.equal(calls.draftWrites, 0);
});

test('invalid or excessive draft input is not persisted', async () => {
  const { controller, calls } = fixture();
  for (const body of [null, [], 'invalid']) assert.equal((await invoke(controller.SaveDraft, request(body))).status, 400);
  assert.equal((await invoke(controller.SaveDraft, request({ data: 'x'.repeat(250001) }))).status, 413);
  assert.equal(calls.draftWrites, 0);
});

for (const route of ['GenerateCv', 'GenerateCvNew']) {
  test(`${route}: success persists owner and closes browser/removes temporary files`, async () => {
    const { controller, calls, files } = fixture();
    const body = route === 'GenerateCv' ? { name: 'Synthetic Candidate', email: 'candidate@example.test' }
      : { personalInfo: { name: 'Synthetic Candidate', contacts: [] }, atsTemplateId: 'classic' };
    const res = await invoke(controller[route], request(body));
    await setImmediate();
    assert.equal(res.status, 201);
    assert.equal(res.body.data.htmlPath, '/api/cv-generator/synthetic-result/html');
    assert.equal(calls.created[0].userId, 'owner-a');
    assert.equal(calls.closed, 1);
    assert.equal(files.size, 0);
  });
}

for (const step of ['launch', 'content', 'pdf', 'parse', 'create', 'save']) {
  test(`new generator: ${step} failure cleans up files/browser`, async () => {
    const { controller, calls, files } = fixture(step);
    const res = await invoke(controller.GenerateCvNew, request({ personalInfo: { name: 'Synthetic Candidate', contacts: [] } }));
    await setImmediate();
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(files.size, 0);
    assert.equal(calls.closed, step === 'launch' ? 0 : 1);
    if (['launch', 'content', 'pdf', 'parse', 'create'].includes(step)) assert.equal(calls.created.length, 0);
  });
}

test('generated HTML is not returned for a different owner', async () => {
  const { controller } = fixture();
  assert.equal((await invoke(controller.GetGeneratedHtml, request({}, 'owner-b'))).status, 404);
  assert.equal((await invoke(controller.GetGeneratedHtml, request())).body, '<h1>Owner A</h1>');
});

test('unavailable ATS template never launches rendering or persists output', async () => {
  const { controller, calls, files } = fixture();
  const res = await invoke(controller.GenerateCvNew, request({ personalInfo: { name: 'Synthetic Candidate' }, atsTemplateId: 'unavailable' }));
  assert.equal(res.body.success, false);
  assert.equal(calls.created.length, 0);
  assert.equal(calls.closed, 0);
  assert.equal(files.size, 0);
});

test('PDF whose extracted text omits the candidate is rejected before persistence', async () => {
  const { controller, calls, files } = fixture();
  const res = await invoke(controller.GenerateCvNew, request({ personalInfo: { name: 'Different Synthetic Name' } }));
  await setImmediate();
  assert.equal(res.status, 500);
  assert.equal(calls.created.length, 0);
  assert.equal(calls.closed, 1);
  assert.equal(files.size, 0);
});
