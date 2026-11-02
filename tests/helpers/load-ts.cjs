const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile only the subject; replace I/O at module boundaries without importing
// the application bootstrap, a queue singleton, or any production connection.
exports.loadTs = (relativePath, dependencies = {}) => {
  const filename = path.resolve(__dirname, '../..', relativePath);
  const subject = new Module(filename, module);
  subject.filename = filename;
  subject.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = subject.require.bind(subject);
  subject.require = (id) => Object.hasOwn(dependencies, id) ? dependencies[id] : originalRequire(id);
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
