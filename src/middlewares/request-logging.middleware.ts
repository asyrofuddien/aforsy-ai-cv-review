import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { logContext } from "../utils/log-context";

export function requestLogging(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  const started = performance.now();
  res.setHeader("X-Request-ID", requestId);
  logContext.run({ requestId }, () => {
    res.on("finish", () => {
      if (res.locals.failureLogged) return;
      if (req.path === "/api/health" && res.statusCode < 400) return;
      const durationMs = Math.round(performance.now() - started);
      const level =
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : durationMs >= 1000
              ? "info"
              : "debug";
      logger.log(level, "Request completed", {
        scope: "http",
        requestId,
        method: req.method,
        route: req.baseUrl + (req.route?.path || req.path),
        status: res.statusCode,
        durationMs,
      });
    });
    next();
  });
}
