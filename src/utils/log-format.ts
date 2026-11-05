const hiddenKey =
  /password|secret|token|authorization|cookie|api[-_]?key|email|headers|requestbody|responsebody|source(text)?|cv(content|text)?|prompt|contacts|personalinfo|filename|originalname/i;

export function cleanLogText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex -- Strip intentional ANSI escape prefixes from untrusted log text.
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
      .replace(
        /(["']?(?:password|secret|token|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)(["'])([\s\S]*?)\2/gi,
        '$1"[REDACTED]"',
      )
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(
        /((?:https?|rediss?|mongodb(?:\+srv)?|postgres(?:ql)?):\/\/)[^\s/@]+:[^\s/@]+@/gi,
        '$1[REDACTED]@',
      )
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
      .replace(/\b(?:sk-|re_)[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
      .replace(
        /((?:password|secret|token|api[_-]?key|authorization|cookie)\s*[=:]\s*)[^\s,;&]+/gi,
        '$1[REDACTED]',
      )
      .replace(
        /([?&](?:[^=\s&]*(?:token|key|code|secret|password)[^=\s&]*)=)[^&\s]+/gi,
        '$1[REDACTED]',
      )
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 1500)
  );
}

export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (typeof value === 'string') return cleanLogText(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    const error = value as Error & {
      code?: string;
      status?: number;
      statusCode?: number;
    };
    return {
      name: cleanLogText(error.name),
      message: cleanLogText(error.message),
      ...(error.code ? { code: cleanLogText(String(error.code)) } : {}),
      ...(error.status || error.statusCode ? { status: error.status || error.statusCode } : {}),
      // Keep stack frames in files without including arbitrary provider request/response objects.
      ...(error.stack
        ? {
            stack: error.stack
              .split('\n')
              .slice(1, 10)
              .map((line) => cleanLogText(line)),
          }
        : {}),
    };
  }
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value))
    return value.slice(0, 15).map((item) => sanitizeLogValue(item, seen, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    result[key] = hiddenKey.test(key) ? '[REDACTED]' : sanitizeLogValue(item, seen, depth + 1);
  }
  return result;
}

export function terminalLine(info: Record<string, any>): string {
  const { timestamp, level, scope = 'app', message, ...details } = info;
  const parts = Object.entries(details)
    .filter(([key, value]) => value !== undefined && key !== 'stack')
    .map(([key, value]) => {
      if (key === 'error' && value && typeof value === 'object') {
        const error = value as Record<string, any>;
        return `error=${JSON.stringify(error.message || error.name || 'Unknown error')}${error.code ? ` code=${error.code}` : ''}`;
      }
      return `${key}=${JSON.stringify(value)}`;
    });
  return `${timestamp} ${String(level).toUpperCase().padEnd(5)} [${scope}] ${message}${parts.length ? ' | ' + parts.join(' ') : ''}`;
}
