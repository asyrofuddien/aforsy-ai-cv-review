import { Job } from "bullmq";
import queueService from "../services/queue.service";
import { reviewWorkflow, jobMatcher } from "../features/review";
import { matcherWorkflow } from "../features/cv-matcher";
import appLogger from "../utils/logger";
import { logContext } from "../utils/log-context";
import { MatcherQueuePayload, ReviewQueuePayload } from "../features/queue/queue.types";
import { operationService } from "../features/ai-operations/operation.service";
import { AiOperation } from "../models/billing.models";
import { aiResultCleanupWorker } from "./cleanup.worker";
import Evaluation from "../models/evaluation.model";
import Document from "../models/document.model";
import { ReviewAIService } from "../features/review/review.ai";
import { createAiDraft } from "../services/cv-draft-ai.service";
import { outboxDispatcher } from "./outbox.dispatcher";
import config from "../config/config";
import { randomUUID } from "crypto";
import { localBillingReconciler } from './reconciler.worker';

const logger = appLogger.child({ scope: "worker" });
function processJob(job: Job<ReviewQueuePayload | MatcherQueuePayload>, type: "review" | "cv-matcher") {
  return logContext.run(
    {
      jobId: String(job.id),
      ...("evaluationId" in job.data
        ? { evaluationId: String(job.data.evaluationId) }
        : {}),
      ...("cvMatcherId" in job.data
        ? { cvMatcherId: String(job.data.cvMatcherId) }
        : {}),
      attempt: String(job.attemptsMade + 1),
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
async function processDurableOperation(job: Job<{ operationId: string }>) {
  const operationId = job.data.operationId;
  const workerToken = randomUUID();
  let operation;
  try {
    operation = await operationService.claimLease(operationId, workerToken);
  } catch (error: any) {
    if (error?.statusCode === 409 || error?.status === 409) {
      logger.info("Durable operation skipped because another worker owns it", { operationId });
      return;
    }
    throw error;
  }
  const heartbeatTimer = setInterval(() => {
    void operationService.heartbeat(operationId, workerToken).catch(error => logger.warn("Operation heartbeat failed", { operationId, error }));
  }, 30_000);
  heartbeatTimer.unref();
  try {
    const op = await AiOperation.findById(operationId).select("+inputSnapshot resourceId action locale maxAttempts attemptCount").lean();
    if (!op) throw new Error("AI operation source is unavailable");
    const snapshot = (op.inputSnapshot || {}) as Record<string, any>;
    if (op.action === "ai_draft") {
      const draft = await createAiDraft(String(snapshot.source || ""), snapshot.reviewGuidance);
      await operationService.saveResultAndCapture(operationId, draft, workerToken);
      return { status: "completed" };
    }
    const evaluationId = String(op.resourceId || "");
    if (!evaluationId) throw new Error("Review record is unavailable");
    if (op.action === "job_match_retry") {
      const evaluation = await Evaluation.findOne({ _id: evaluationId, userId: operation.userId, matchingRetryOperationId: operationId }).select("+matchingProfile cvDocumentId");
      if (!evaluation) throw new Error("Matching retry source is unavailable");
      let profile = evaluation.matchingProfile;
      if (!profile) {
        const document = await Document.findOne({ _id: evaluation.cvDocumentId, userId: operation.userId }).select("content").lean();
        if (!document?.content?.trim()) throw new Error("CV source is no longer available");
        profile = await new ReviewAIService().extractCVInfo(document.content) as unknown as Record<string, unknown>;
        await Evaluation.updateOne({ _id: evaluationId, matchingRetryOperationId: operationId }, { $set: { matchingProfile: profile } });
      }
      const matching = await logContext.run({ evaluationId, jobId: String(job.id), operationId, attempt: String(op.attemptCount) }, () => jobMatcher.findMatches(profile));
      await operationService.saveResultAndCapture(operationId, { evaluationId, matching }, workerToken);
      return { status: "completed" };
    }
    const reviewResult = await reviewWorkflow.process({
      evaluationId,
      cvDocumentId: String(snapshot.cvDocumentId),
      jobDescriptionId: snapshot.jobDescriptionId ? String(snapshot.jobDescriptionId) : undefined,
      jobDescriptionText: snapshot.jobDescriptionText ? String(snapshot.jobDescriptionText) : undefined,
      candidateName: snapshot.candidateName ? String(snapshot.candidateName) : undefined,
      locale: op.locale === "id" ? "id" : "en",
      attempt: op.attemptCount,
      maxAttempts: op.maxAttempts,
    });
    const evaluation = await Evaluation.findById(evaluationId).select("status result").lean();
    if (!evaluation || evaluation.status !== "completed" || !evaluation.result) throw new Error("Review did not produce a completed result");
    if (evaluation.result.jobMatchingStatus === "failed") {
      await operationService.savePartialAndSettle(operationId, "matching_failed_final", { evaluationId }, workerToken);
      return { status: "completed_partial" };
    }
    await operationService.saveResultAndCapture(operationId, { evaluationId }, workerToken);
    return { status: "completed", hadReviewResult: Boolean(reviewResult) };
  } catch (error) {
    if (job.attemptsMade + 1 >= Number(job.opts.attempts || 1)) {
      await operationService.releaseTerminal(operationId, "operation_failed_final", workerToken);
    } else {
      await operationService.retryLease(operationId, workerToken);
    }
    throw error;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export const startWorker = (): void => {
  queueService.initializeEvaluationWorker((job) => processJob(job, "review"));
  queueService.initializeCVMatcherWorker((job) =>
    processJob(job, "cv-matcher"),
  );
  queueService.initializeAiOperationWorker(processDurableOperation);
  // Poll durable inbox/outbox frequently so confirmed purchases grant credits
  // and send their receipt without waiting for the slower safety reconciler.
  outboxDispatcher.start(5_000);
  localBillingReconciler.start(config.billing.reconcileIntervalMs);
  aiResultCleanupWorker.start();
  logger.info("Workers ready", { queues: ["review", "cv-matcher", "ai-operation"] });
};
