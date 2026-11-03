const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate } = require('node:timers/promises');
const { loadTs, logger, invoke } = require('./helpers/load-ts.cjs');
const { AppError, asyncHandler } = loadTs('src/middlewares/error.middleware.ts', { '../utils/logger': logger });

function fixture(failAt) {
  const files = new Map();
  const calls = { closed: 0, created: [], draftWrites: 0, list: null };
  const fail = (step) => { if (failAt === step) throw new Error(`Synthetic ${step} failure`); };
  const page = {
    target: () => ({ createCDPSession: async () => ({ send: async () => {} }) }),
    setRequestInterception: async () => {}, setViewport: async () => {},
    setContent: async () => { fail('content'); }, evaluateHandle: async () => {},
    pdf: async ({ path }) => { files.set(path, Buffer.from('%PDF-synthetic')); fail('pdf'); },
  };
  const browser = { newPage: async () => page, close: async () => { calls.closed++; } };
  const template = '<html><head><style>body{font-family:Arial;margin:0}</style></head><body><h1>{{name}}{{personalInfo.name}}</h1><h2>Experience</h2></body></html>';
  const fileSystem = {
    existsSync: () => true, mkdirSync() {},
    writeFileSync: (name, value) => files.set(name, value),
    readFileSync: name => { assert.ok(files.has(name)); return files.get(name); },
    unlinkSync: name => files.delete(name),
  };
  const drafts = new Map([['owner-a', { data: { personalInfo: { name: 'Owner A' } }, updatedAt: 'synthetic-date' }], ['owner-b', { data: { personalInfo: { name: 'Owner B' } } }]]);
  const draftRepository = {
    findByOwner: async ownerId => drafts.get(ownerId) || null,
    upsertForOwner: async (ownerId, data) => {
      calls.draftWrites++;
      const value = { data, updatedAt: 'saved-date' };
      drafts.set(ownerId, value); return value;
    },
    deleteByOwner: async ownerId => { drafts.delete(ownerId); },
  };
  const { createCvDraftService } = loadTs('src/features/cv-generator/drafts/cv-draft.service.ts', {
    '../../../middlewares/error.middleware': { AppError },
    './cv-draft.repository': { mongoCvDraftRepository: draftRepository },
  });
  const cvDraftService = createCvDraftService(draftRepository);
  const cvTemplateService = loadTs('src/features/cv-generator/rendering/cv-template.service.ts', { fs: fileSystem });
  const pdfRenderer = loadTs('src/features/cv-generator/rendering/puppeteer-pdf.renderer.ts', {
    fs: fileSystem,
    puppeteer: { launch: async () => { fail('launch'); return browser; } },
    '../../../utils/logger': logger,
  });
  const atsTemplateStyle = loadTs('src/features/cv-generator/rendering/ats-template-style.ts');
  const generatedRecords = [];
  const generationRepository = {
    findLegacyTemplate: async () => ({ content: template }), findNewTemplate: async () => ({ content: template }),
    findNewTemplateContent: async () => template,
    findActiveTemplate: async id => { calls.templateId = id; return id === 'unavailable' ? null : { layout: {
      variant: id, pageMargin: id === 'compact' ? '0.3in' : '0.4in',
      headingColor: id === 'modern' ? '#1e3a8a' : '#000000', accentColor: id === 'modern' ? '#2563eb' : id === 'compact' ? '#555555' : '#000000',
    } }; },
    createGeneratedCv: async record => { fail('create'); generatedRecords.push(record); return { ...record, id: 'synthetic-result', save: async () => { fail('save'); } }; },
    findAllForOwner: async (ownerId, page, limit) => {
      calls.list = { ownerId, page, limit };
      return { records: [{ _id: 'cv-1', file_name: 'ATS_Owner_A.pdf' }], total: 21 };
    },
    findPdfForOwner: async (_id, userId) => userId === 'owner-a' ? { pdf_file: Buffer.from('%PDF-synthetic').toString('base64') } : null,
    findHtmlForOwner: async (_id, userId) => userId === 'owner-a' ? { html_text: '<h1>Owner A</h1>' } : null,
    findSourceForOwner: async (_id, userId) => userId === 'owner-a' ? { source_data: { personalInfo: { name: 'Owner A' } } } : null,
    findActiveTemplates: async () => [],
  };
  const generationRenderer = loadTs('src/features/cv-generator/generation/cv-generation.service.ts', {
    '../../../middlewares/error.middleware': { AppError },
    '../../../types/evaluation.types': {},
    'pdf-parse': async () => { fail('parse'); return { numpages: 1, text: 'Synthetic Candidate' }; },
    './cv-generation.repository': { cvGenerationRepository: generationRepository },
    '../rendering/ats-template-style': atsTemplateStyle,
    '../rendering/cv-template.service': cvTemplateService,
    '../rendering/puppeteer-pdf.renderer': pdfRenderer,
  });
  const cvGenerationService = generationRenderer.createCvGenerationService(generationRepository);
  const controller = loadTs('src/controllers/cv-generator.controller.ts', {
    '../utils/logger': logger,
    '../middlewares/error.middleware': { AppError, asyncHandler },
    '../features/cv-generator/drafts/cv-draft.service': { cvDraftService },
    '../features/cv-generator/drafts/saved-cv-draft.service': { savedCvDraftService: {} },
    '../features/cv-generator/generation/cv-generation.service': { cvGenerationService },
    '../features/cv-generator/generation/cv-generation.response': { generatedCvResponse: result => ({ success: true, message: 'CV generated successfully', data: result }) },
  }).default;
  calls.created = generatedRecords;
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

test('generated CV list returns paginated metadata without PDF or HTML payloads', async () => {
  const { controller, calls } = fixture();
  const req = request();
  req.query = { page: '2', limit: '10' };
  const res = await invoke(controller.FindAllCv, req);
  assert.equal(res.status, 200);
  assert.deepEqual(calls.list, { ownerId: 'owner-a', page: 2, limit: 10 });
  assert.deepEqual(res.body.pagination, { page: 2, limit: 10, total: 21, totalPages: 3 });
  assert.deepEqual(res.body.data, [{ _id: 'cv-1', file_name: 'ATS_Owner_A.pdf' }]);
});

test('generated PDF endpoint is owner-scoped and returns PDF bytes', async () => {
  const { controller } = fixture();
  assert.equal((await invoke(controller.GetGeneratedPdf, request({}, 'owner-b'))).status, 404);
  const res = await invoke(controller.GetGeneratedPdf, request());
  assert.equal(res.status, 200);
  assert.ok(Buffer.isBuffer(res.body));
  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-');
});

test('editable source remains owner-scoped for CV recreation', async () => {
  const { controller } = fixture();
  assert.equal((await invoke(controller.GetGeneratedSource, request({}, 'owner-b'))).status, 404);
  assert.deepEqual((await invoke(controller.GetGeneratedSource, request())).body.data, {
    personalInfo: { name: 'Owner A' },
  });
});

test('generated CV pagination rejects invalid or excessive limits', async () => {
  const { controller, calls } = fixture();
  for (const query of [{ page: '0' }, { page: '1.5' }, { page: '10001' }, { limit: '101' }]) {
    const req = request();
    req.query = query;
    assert.equal((await invoke(controller.FindAllCv, req)).status, 400);
  }
  assert.equal(calls.list, null);
});

test('preview template endpoint returns the same new-template source used by generation', async () => {
  const { controller } = fixture();
  for (const variant of ['classic', 'modern', 'compact']) {
    const req = request();
    req.query.templateId = variant;
    const res = await invoke(controller.GetNewTemplateContent, req);
    assert.equal(res.status, 200);
    assert.match(res.body, /<html/i);
    assert.match(res.body, /personalInfo\.name/);
    assert.match(res.body, new RegExp(`body class="ats-template--${variant}"`));
  }
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
