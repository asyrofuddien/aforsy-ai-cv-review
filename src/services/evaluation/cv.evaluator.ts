import { ReviewAIService } from '../../features/review/review.ai';
import appLogger from '../../utils/logger';
import { reviewRepository } from '../../features/review/review.repository';
import { ReviewDescription } from '../../features/review/review.types';
import { validateAndAggregateReview } from '../../features/review/review.scoring';

const logger = appLogger.child({ scope: 'cv-review' });
const reviewAI = new ReviewAIService();

interface ReviewDocument { content?: string; }
interface ReviewDataRepository {
  findCvDocument(id: string): Promise<ReviewDocument | null>;
  findJobDescription(id: string): Promise<ReviewDescription | null>;
}
interface ReviewAI {
  extractCVInfo(content: string): Promise<unknown>;
  evaluateCV(cv: unknown, requirements: Record<string, unknown>): Promise<{ criteria?: unknown; strengths?: string[]; gaps?: string[]; feedback: string; missing_information?: string[]; scores?: Record<string, number> }>;
}

export class CVEvaluator {
  constructor(
    private readonly repository: ReviewDataRepository = reviewRepository,
    private readonly ai: ReviewAI = reviewAI,
  ) {}

  async evaluate(cvDocumentId: string, jobDescriptionId?: string, jobDescriptionText?: string, locale: 'id' | 'en' = 'en') {
    try {
      const sourceStarted = performance.now();
      logger.info('Loading CV source for review');
      const cvDoc = await this.repository.findCvDocument(cvDocumentId);
      if (!cvDoc) throw new Error('CV document not found');
      const jobDesc = jobDescriptionId ? await this.repository.findJobDescription(jobDescriptionId) : null;
      if (jobDescriptionId && !jobDesc) throw new Error('Job description not found');
      if (!cvDoc.content?.trim()) throw new Error('CV contains no readable text. Upload a text-based PDF, DOCX or TXT.');
      logger.info('CV source loaded', {
        durationMs: Math.round(performance.now() - sourceStarted),
        characterCount: cvDoc.content.length,
        hasJobDescription: Boolean(jobDesc || jobDescriptionText),
      });

      const extractionStarted = performance.now();
      logger.info('CV information extraction started');
      const cvInfo = await this.ai.extractCVInfo(cvDoc.content);
      logger.info('CV information extraction completed', { durationMs: Math.round(performance.now() - extractionStarted) });

      const evaluationStarted = performance.now();
      logger.info('CV criteria evaluation started', { mode: jobDesc || jobDescriptionText ? 'job_specific' : 'general' });
      const evaluation = await this.ai.evaluateCV({ ...(cvInfo as object), sourceText: cvDoc.content }, {
        locale,
        mode: jobDesc || jobDescriptionText ? 'job_specific' : 'general',
        title: jobDesc?.title,
        company: jobDesc?.company,
        description: jobDescriptionText || jobDesc?.description,
        requirements: jobDesc?.requirements,
        context: [],
        scoringWeigths: jobDesc?.scoringWeights,
      });
      logger.info('CV criteria evaluation completed', {
        durationMs: Math.round(performance.now() - evaluationStarted),
        criteriaCount: Array.isArray(evaluation.criteria) ? evaluation.criteria.length : 0,
      });
      const matchRate = validateAndAggregateReview(evaluation.criteria);
      logger.info('CV review score calculated', { matchRate });
      return {
        extractedInfo: cvInfo as { name?: string },
        evaluation: { ...evaluation, strengths: evaluation.strengths || [], improvements: evaluation.gaps || [], recommendations: [] },
        matchRate,
      };
    } catch (error) {
      logger.error('CV evaluation failed', { error });
      throw error;
    }
  }
}

export default new CVEvaluator();
