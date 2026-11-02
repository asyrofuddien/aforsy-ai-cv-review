import { Job } from "bullmq";
import queueService from "../services/queue.service";
import { reviewWorkflow } from "../features/review";
import { matcherWorkflow } from "../features/cv-matcher";
import appLogger from "../utils/logger";
import { logContext } from "../utils/log-context";
import { MatcherQueuePayload, ReviewQueuePayload } from "../features/queue/queue.types";

const logger = appLogger.child({ scope: "worker" });
function processJob(job: Job<ReviewQueuePayload | MatcherQueuePayload>, type: "review" | "cv-matcher") {
  return logContext.run(
    {
      jobId: String(job.id),
      ...("evaluationId" in job.data
        ? { evaluationId: String(job.data.evaluationId) }
        : {}),
    },
    async () => {
      const started = performance.now();
      logger.info("Job started", { type, attempt: job.attemptsMade + 1 });
      // Queue's failed event owns failure logging; lower layers rethrow for retry.
      const result =
        type === "review"
          ? await reviewWorkflow.process({ ...job.data as ReviewQueuePayload, attempt: job.attemptsMade + 1, maxAttempts: Number(job.opts.attempts) || 1 })
          : await matcherWorkflow.process({ ...job.data as MatcherQueuePayload, attempt: job.attemptsMade + 1, maxAttempts: Number(job.opts.attempts) || 1 });
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
