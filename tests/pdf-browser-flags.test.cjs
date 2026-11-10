const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs, logger } = require('./helpers/load-ts.cjs');

async function launchArgs(disableSandbox) {
  const files = new Map();
  let args;
  const fileSystem = {
    mkdirSync() {},
    writeFileSync(name, content) {
      files.set(name, content);
    },
    readFileSync(name) {
      return files.get(name);
    },
    unlinkSync(name) {
      files.delete(name);
    },
  };
  const page = {
    setRequestInterception: async () => {},
    on() {},
    setViewport: async () => {},
    setContent: async () => {},
    evaluateHandle: async () => {},
    pdf: async ({ path }) => {
      files.set(path, Buffer.from('%PDF-test'));
    },
  };
  const browser = { newPage: async () => page, close: async () => {} };
  const { renderCvPdf } = loadTs('src/features/cv-generator/rendering/puppeteer-pdf.renderer.ts', {
    fs: fileSystem,
    puppeteer: {
      launch: async (options) => {
        args = options.args;
        return browser;
      },
    },
    '../../../config/config': { puppeteer: { disableSandbox } },
    '../../../utils/logger': logger,
  });
  const pdf = await renderCvPdf('<h1>Test</h1>', 'test', {
    viewport: { width: 800, height: 600 },
    margin: '0.2in',
    timeoutMs: 1000,
    protocolTimeoutMs: 1000,
  });
  assert.equal(pdf.toString(), '%PDF-test');
  return args;
}

test('PDF browser keeps sandbox by default and opts out only when configured', async () => {
  const sandboxed = await launchArgs(false);
  assert.ok(!sandboxed.includes('--no-sandbox'));
  assert.ok(!sandboxed.includes('--no-zygote'));
  assert.ok(!sandboxed.includes('--single-process'));

  const unsupportedHost = await launchArgs(true);
  assert.ok(unsupportedHost.includes('--no-sandbox'));
  assert.ok(!unsupportedHost.includes('--no-zygote'));
});
