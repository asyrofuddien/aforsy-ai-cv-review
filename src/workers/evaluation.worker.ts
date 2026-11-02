import { Job } from "bullmq";
import queueService from "../services/queue.service";
import evaluationService from "../services/evaluation/evaluation.service";
import appLogger from "../utils/logger";
import { logContext } from "../utils/log-context";

const logger = appLogger.child({ scope: "worker" });
function processJob(job: Job, type: "review" | "cv-matcher") {
  return logContext.run(
    {
      jobId: String(job.id),
      ...(job.data.evaluationId
        ? { evaluationId: String(job.data.evaluationId) }
        : {}),
    },
    async () => {
      const started = performance.now();
      logger.info("Job started", { type, attempt: job.attemptsMade + 1 });
      // Queue's failed event owns failure logging; lower layers rethrow for retry.
      const result =
        type === "review"
          ? await evaluationService.processEvaluation(job.data)
          : await evaluationService.processCvMatcher(job.data);
      logger.info("Job completed", {
        type,
        durationMs: Math.round(performance.now() - started),
      });
      return result;
    },
  );
}
export const startWorker = (): void => {
  queueService.initializeEvaluationWorker((job) => processJob(job, "review"));
  queueService.initializeCVMatcherWorker((job) =>
    processJob(job, "cv-matcher"),
  );
  logger.info("Workers ready", { queues: ["review", "cv-matcher"] });
};
