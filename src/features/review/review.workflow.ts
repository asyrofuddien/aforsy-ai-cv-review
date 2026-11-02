import { ReviewDescription, ReviewJobPayload, ReviewResult } from './review.types';
import { mapReviewResult } from './review.response';

export interface ReviewWorkflowDependencies {
  repository: {
    markProcessing(id: string): Promise<unknown>;
    findJobDescription(id: string): Promise<ReviewDescription | null>;
    complete(id: string, candidateName: string | undefined, result: ReviewResult): Promise<unknown>;
    fail(id: string, message: string): Promise<unknown>;
    retry?(id: string): Promise<unknown>;
  };
  evaluator: { evaluate(cvDocumentId: string, jobDescriptionId?: string, jobDescriptionText?: string, locale?: 'id' | 'en'): Promise<any> };
  summary: { generateFinalSummary(evaluation: unknown, mode: 'general' | 'job_specific', locale: 'id' | 'en'): Promise<{ overall_summary?: string; recommendation?: string; missing_information?: string[] }> };
  logger?: { debug(message: string, metadata?: unknown): void };
}

export function createReviewWorkflow(dependencies: ReviewWorkflowDependencies) {
  const { repository, evaluator, summary, logger } = dependencies;
  return {
    async process(payload: ReviewJobPayload): Promise<ReviewResult | null> {
      const locale = payload.locale === 'id' ? 'id' : 'en';
      try {
        logger?.debug('Review workflow started', { evaluationId: payload.evaluationId });
        const claimed = await repository.markProcessing(payload.evaluationId);
        if (claimed === null) return null;
        const description = payload.jobDescriptionId ? await repository.findJobDescription(payload.jobDescriptionId) : null;
        if (payload.jobDescriptionId && !description) throw new Error('Job description not found');
        const result = await evaluator.evaluate(payload.cvDocumentId, payload.jobDescriptionId, payload.jobDescriptionText, locale);
        const mode = description || payload.jobDescriptionText ? 'job_specific' : 'general';
        const summaryResult = await summary.generateFinalSummary(result.evaluation, mode, locale);
        const response = mapReviewResult(result, description, payload.jobDescriptionText, locale, summaryResult);
        const candidateName = result.extractedInfo?.name && !['Unknown', 'Unknown Candidate'].includes(result.extractedInfo.name)
          ? result.extractedInfo.name : undefined;
        await repository.complete(payload.evaluationId, candidateName, response);
        logger?.debug('Review workflow completed', { evaluationId: payload.evaluationId });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if ((payload.attempt ?? 1) < (payload.maxAttempts ?? 1) && repository.retry) await repository.retry(payload.evaluationId);
        else await repository.fail(payload.evaluationId, message);
        throw error;
      }
    },
  };
}
