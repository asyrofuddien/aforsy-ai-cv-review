# Application logging

Terminal entries use one readable line:

```text
2026-11-02 15:20:01.123+07:00 INFO  [worker] Job started | jobId="42" evaluationId="abc" type="review" attempt=1
2026-11-02 15:20:12.456+07:00 INFO  [worker] Job completed | jobId="42" evaluationId="abc" type="review" durationMs=11333
```

- Timestamps explicitly use Asia/Jakarta (+07:00). API PM2 timestamps are disabled in `ecosystem.config.cjs` so they do not repeat application timestamps; web PM2 timestamps remain enabled for native Next output.
- Production defaults to `LOG_LEVEL=info`; use `LOG_LEVEL=debug` for parser/AI stages, queue events and successful short HTTP requests. The logger accepts error/warn/info/http/debug; invalid values fall back to info.
- Each request receives a generated `X-Request-ID`, exposed to the browser through CORS. Its logs share that ID through async context. Worker logs share job/evaluation IDs. Request logs include method, route, status and duration, without query strings or bodies.
- Expected HTTP rejections (4xx) are warnings; unexpected failures (5xx) are errors. A handled request error is logged once. Queue worker failure owns the background-job error record; lower-level diagnostics are debug entries.
- Terminal errors are compact. New entries in `logs/all.log` and `logs/error.log` are JSON with metadata and sanitized stack frames, without ANSI color codes. Each application file rotates at 10 MB with 5 files retained. `LOG_DIR` can override this directory. PM2 output files are managed separately.
- Raw CV text, parser previews, model response previews, extracted names, recipient emails and authentication URLs are no longer explicitly printed. Metadata redacts sensitive keys, emails and common credential patterns. Error serialization only keeps diagnostics instead of copying provider request/response objects. Avoid passing user payloads into log messages; pattern redaction cannot identify every possible secret or personal detail.
- Browser diagnostics use the same component/level style and retain only error code, HTTP status and request ID rather than dumping Axios/form objects.

Run `node --test tests/logging.test.cjs tests/cv-draft-ai.test.cjs` for formatting, redaction, async correlation and existing AI import checks. This does not make requests to an AI provider. Deployment and PM2 reload remain manual via the existing deploy flow. Historical log entries are not rewritten.
