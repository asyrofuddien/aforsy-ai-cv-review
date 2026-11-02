require('ts-node').register({transpileOnly:true});
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const winston = require('winston');
const {Writable} = require('node:stream');
const {cleanLogText, sanitizeLogValue, terminalLine} = require('../src/utils/log-format');
const {normalizeLog, default: rootLogger} = require('../src/utils/logger');
const {logContext} = require('../src/utils/log-context');
after(()=>rootLogger.close());
test('redacts credentials, auth query strings and email, and prevents injected terminal lines',()=>{
 const safe = cleanLogText('🚀 User alice@example.com\nBearer secret-value token=private https://u:p@host/path?code=sensitive&token=hidden');
 for(const secret of ['alice@example.com','secret-value','private','sensitive','hidden','u:p']) assert.ok(!safe.includes(secret));
 assert.ok(!safe.includes('\n'));
});
test('keeps useful metadata while removing nested request data and secrets',()=>{
 const safe = sanitizeLogValue({jobId:'42',durationMs:82,profile:{email:'test@example.com',password:'p'},headers:{cookie:'s'},prompt:'personal CV'});
 assert.equal(safe.jobId,'42'); assert.equal(safe.durationMs,82);
 assert.equal(safe.profile.email,'[REDACTED]'); assert.equal(safe.headers,'[REDACTED]'); assert.equal(safe.prompt,'[REDACTED]');
});
test('serializes errors without dumping Axios/provider request or response objects',()=>{
 const error = new Error('Request failed');error.config={apiKey:'secret'}; error.response={data:'CV contents'};
 const safe = JSON.stringify(sanitizeLogValue(error));
 assert.ok(safe.includes('Request failed'));assert.ok(!safe.includes('secret'));assert.ok(!safe.includes('CV contents'));
});
test('handles circular structures safely',()=>{
 const circular={value:1};circular.self=circular;
 assert.equal(sanitizeLogValue(circular).self,'[CIRCULAR]');
});
test('terminal output has stable columns and omits stack frames',()=>{
 const line=terminalLine({timestamp:'2026-11-02 12:00:00+07:00',level:'error',scope:'worker',message:'Job failed',jobId:'42',error:{message:'Invalid JSON',stack:['secret stack']}});
 assert.match(line,/ERROR \[worker\] Job failed/);assert.ok(line.includes('jobId="42"'));assert.ok(!line.includes('stack'));
});
test('Winston child logs preserve metadata, error details and asynchronous context',async()=>{
 const records=[];
 const stream=new Writable({write(chunk,_encoding,done){records.push(JSON.parse(chunk.toString()));done();}});
 const logger=winston.createLogger({format:winston.format.combine(normalizeLog(),winston.format.json()),transports:[new winston.transports.Stream({stream})]});
 const child=logger.child({scope:'test'});
 await logContext.run({requestId:'request-42'},async()=>{await Promise.resolve();child.error('Operation failed',{jobId:'job-42',error:new Error('Invalid input'),token:'sensitive'});});
 await new Promise(resolve=>logger.end(resolve));
 assert.equal(records[0].scope,'test');assert.equal(records[0].requestId,'request-42');assert.equal(records[0].jobId,'job-42');
 assert.equal(records[0].error.message,'Invalid input');assert.equal(records[0].token,'[REDACTED]');
 logger.close();
});
test('legacy error arguments retain cause without repeating it in the message',async()=>{
 const records=[];
 const stream=new Writable({write(chunk,_encoding,done){records.push(JSON.parse(chunk.toString()));done();}});
 const logger=winston.createLogger({format:winston.format.combine(normalizeLog(),winston.format.json()),transports:[new winston.transports.Stream({stream})]});
 logger.child({scope:'legacy'}).error('Operation failed:',new Error('Connection lost'));
 await new Promise(resolve=>logger.end(resolve));
 assert.equal(records[0].message,'Operation failed');assert.equal(records[0].error.message,'Connection lost');
 logger.close();
});
test('quoted secrets, JWTs and database URL credentials are removed from error messages',()=>{
 const value=cleanLogText('password="my secret value" {"apiKey":"private-key-value"} redis://dbuser:dbpass@redis.local eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoxfQ.signature');
 for(const secret of ['my secret value','private-key-value','dbuser','dbpass','eyJhbGci']) assert.ok(!value.includes(secret));
});
