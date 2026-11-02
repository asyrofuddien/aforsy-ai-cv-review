import { ReviewDescription, ReviewJobPayload, ReviewResult } from './review.types';
import { mapReviewResult } from './review.response';

export interface ReviewWorkflowDependencies {
  repository: {
    markProcessing(id: string, retrying: boolean): Promise<unknown>;
    findJobDescription(id: string): Promise<ReviewDescription | null>;
    complete(id: string, candidateName: string | undefined, result: ReviewResult): Promise<unknown>;
    fail(id: string, message: string): Promise<unknown>;
    retry?(id: string): Promise<unknown>;
  };
  evaluator: { evaluate(cvDocumentId: string, jobDescriptionId?: string, jobDescriptionText?: string, locale?: 'id' | 'en'): Promise<any> };
  summary: { generateFinalSummary(evaluation: unknown, mode: 'general' | 'job_specific', locale: 'id' | 'en'): Promise<{ overall_summary?: string; recommendation?: string; missing_information?: string[] }> };
  jobMatcher?: { findMatches(profile: unknown): Promise<{ suggestedRoles: string[]; jobs: unknown[] }> };
  logger?: {
    debug?(message: string, metadata?: unknown): void;
    info?(_message: string, _metadata?: unknown): void;
    warn?(message: string, metadata?: unknown): void;
    error?(_message: string, _metadata?: unknown): void;
  };
}

async function runStage<T>(
  logger: ReviewWorkflowDependencies['logger'],
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  logger?.info?.('Review stage started', { stage });
  try {
    const result = await operation();
    logger?.info?.('Review stage completed', { stage, durationMs: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    logger?.error?.('Review stage failed', {
      stage,
      durationMs: Math.round(performance.now() - started),
      error,
    });
    throw error;
  }
}

export function createReviewWorkflow(dependencies: ReviewWorkflowDependencies) {
  const { repository, evaluator, summary, jobMatcher, logger } = dependencies;
  return {
    async process(payload: ReviewJobPayload): Promise<ReviewResult | null> {
      const locale = payload.locale === 'id' ? 'id' : 'en';
      const startedAt = performance.now();
      try {
        logger?.info?.('Review workflow started', {
          evaluationId: payload.evaluationId,
          attempt: payload.attempt ?? 1,
          maxAttempts: payload.maxAttempts ?? 1,
          mode: payload.jobDescriptionId || payload.jobDescriptionText ? 'job_specific' : 'general',
        });
        const claimed = await runStage(logger, 'claim review record', () => repository.markProcessing(payload.evaluationId, (payload.attempt ?? 1) > 1));
        if (claimed === null) {
          logger?.info?.('Review job skipped because the record is already claimed or complete', { evaluationId: payload.evaluationId });
          return null;
        }
        const description = payload.jobDescriptionId
          ? await runStage(logger, 'load job description', () => repository.findJobDescription(payload.jobDescriptionId!))
          : null;
        if (payload.jobDescriptionId && !description) throw new Error('Job description not found');
        const result = await runStage(logger, 'analyze CV', () => evaluator.evaluate(payload.cvDocumentId, payload.jobDescriptionId, payload.jobDescriptionText, locale));
        const mode = description || payload.jobDescriptionText ? 'job_specific' : 'general';
        const summaryResult = await runStage(logger, 'generate review summary', () => summary.generateFinalSummary(result.evaluation, mode, locale));
        const response = mapReviewResult(result, description, payload.jobDescriptionText, locale, summaryResult);
        if (jobMatcher) {
          try {
            const matches = await runStage(logger, 'suggest roles, search jobs, and score matches', () => jobMatcher.findMatches(result.extractedInfo));
            response.suggestedRoles = matches.suggestedRoles;
            response.jobMatches = matches.jobs;
            response.jobMatchingStatus = 'completed';
          } catch (error) {
            response.jobMatchingStatus = 'failed';
            response.jobMatchingError = 'Job matching could not run. Your CV review is ready.';
            logger?.warn?.('Job matching failed after a successful CV review', {
              evaluationId: payload.evaluationId,
              error: error instanceof Error ? error.message : 'Unknown job matching error',
            });
          }
        }
        const candidateName = result.extractedInfo?.name && !['Unknown', 'Unknown Candidate'].includes(result.extractedInfo.name)
          ? result.extractedInfo.name : undefined;
        await runStage(logger, 'save completed review and job matches', () => repository.complete(payload.evaluationId, candidateName, response));
        logger?.info?.('Review workflow completed', {
          evaluationId: payload.evaluationId,
          jobMatchingStatus: response.jobMatchingStatus,
          jobMatchCount: response.jobMatches.length,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if ((payload.attempt ?? 1) < (payload.maxAttempts ?? 1) && repository.retry) {
          await repository.retry(payload.evaluationId);
          logger?.warn?.('Review attempt failed; queue retry scheduled', {
            evaluationId: payload.evaluationId,
            attempt: payload.attempt ?? 1,
            maxAttempts: payload.maxAttempts ?? 1,
            error,
          });
        } else {
          await repository.fail(payload.evaluationId, message);
          logger?.error?.('Review workflow failed permanently', {
            evaluationId: payload.evaluationId,
            attempt: payload.attempt ?? 1,
            maxAttempts: payload.maxAttempts ?? 1,
            error,
          });
        }
        throw error;
      }
    },
  };
}
