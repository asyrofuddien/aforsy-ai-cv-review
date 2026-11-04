const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const testConfig = {
  port: 3000,
  host: '127.0.0.1',
  nodeEnv: 'test',
  database: { mongoUri: 'mongodb://localhost/test', redisUrl: 'redis://localhost:6379' },
  queue: { concurrency: 2, cvMatcherConcurrency: 10 },
  jobs: {
    provider: 'rapidapi', fallback: 'aggregate', rapidApiKey: '', rapidApiHost: 'jobs-api14.p.rapidapi.com',
    rapidApiBaseUrl: 'https://jobs-api14.p.rapidapi.com', rapidApiPlatform: 'linkedin', rapidApiCountryCode: 'id',
    rapidApiMaxPages: 1, greenhouseBoards: [], leverSites: [],
  },
  upload: { uploadDir: 'uploads', maxFileSize: 10 * 1024 * 1024, allowedTypes: [] },
  cors: { allowedOrigins: [] },
  auth: { frontendUrl: 'http://localhost:3000' },
  billing: { trialEnabled: false, adminGrantsEnabled: false },
  logging: { level: 'error', directory: 'logs' },
  shutdown: { gracePeriodMs: 30000, forcePeriodMs: 3000 },
  puppeteer: { executablePath: undefined },
};

// Compile only the subject; replace I/O at module boundaries without importing
// the application bootstrap, a queue singleton, or any production connection.
exports.loadTs = (relativePath, dependencies = {}) => {
  const filename = path.resolve(__dirname, '../..', relativePath);
  const subject = new Module(filename, module);
  subject.filename = filename;
  subject.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = subject.require.bind(subject);
  subject.require = (id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    if (id.endsWith('/config/config')) return testConfig;
    return originalRequire(id);
  };
  subject._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
  return subject.exports;
};

exports.logger = { child() { return this; }, info() {}, debug() {}, warn() {}, error() {} };

exports.invoke = (handler, request) => new Promise((resolve, reject) => {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { resolve({ status: this.statusCode, body }); return this; },
    setHeader() {},
    type() { return this; },
    send(body) { resolve({ status: this.statusCode, body }); return this; },
  };
  handler(request, response, reject);
});
