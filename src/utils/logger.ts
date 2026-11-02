import winston from "winston";
import path from "path";
import fs from "fs";
import moment from "moment-timezone";
import { cleanLogText, sanitizeLogValue, terminalLine } from "./log-format";
import { logContext } from "./log-context";

const logDir = path.resolve(process.env.LOG_DIR || "logs");
fs.mkdirSync(logDir, { recursive: true });
const levels = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const requestedLevel =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "development" ? "debug" : "info");
const level = Object.hasOwnProperty.call(levels, requestedLevel)
  ? requestedLevel
  : "info";
const splat = Symbol.for("splat");

export const normalizeLog = winston.format((info) => {
  const extras = (info[splat] || []) as unknown[];
  const meta: Record<string, unknown> = { ...logContext.getStore() };
  for (const [key, value] of Object.entries(info)) {
    if (!["level", "message", "timestamp", "stack"].includes(key))
      meta[key] = value;
  }
  for (const extra of extras) {
    if (extra instanceof Error) meta.error = extra;
    else if (extra && typeof extra === "object") Object.assign(meta, extra);
    else if (extra !== undefined) meta.detail = extra;
  }
  if (info.stack && !meta.error)
    meta.error = { message: info.message, stack: info.stack };
  const safe = sanitizeLogValue(meta) as Record<string, unknown>;
  for (const key of Object.keys(info)) {
    if (!["level", "message", "timestamp"].includes(key)) delete info[key];
  }
  Object.assign(info, safe);
  let message = String(info.message || "");
  const originalError = extras.find((extra) => extra instanceof Error) as
    Error | undefined;
  if (
    originalError &&
    message.endsWith(" " + originalError.message) &&
    message.length > originalError.message.length + 1
  ) {
    message = message
      .slice(0, -(originalError.message.length + 1))
      .replace(/:\s*$/, "");
  }
  info.message = cleanLogText(message);
  delete info[splat];
  return info;
});
const maxsize = 10 * 1024 * 1024;
const logger = winston.createLogger({
  level,
  levels,
  format: winston.format.combine(
    normalizeLog(),
    winston.format.timestamp({
      format: () =>
        moment().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss.SSSZ"),
    }),
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ["error"],
      format: winston.format.printf((info) => terminalLine(info)),
    }),
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize,
      maxFiles: 5,
      tailable: true,
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: path.join(logDir, "all.log"),
      maxsize,
      maxFiles: 5,
      tailable: true,
      format: winston.format.json(),
    }),
  ],
});
export default logger;
