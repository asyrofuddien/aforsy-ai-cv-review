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
      logger.debug('CV evaluator started');
      const cvDoc = await this.repository.findCvDocument(cvDocumentId);
      if (!cvDoc) throw new Error('CV document not found');
      const jobDesc = jobDescriptionId ? await this.repository.findJobDescription(jobDescriptionId) : null;
      if (jobDescriptionId && !jobDesc) throw new Error('Job description not found');
      if (!cvDoc.content?.trim()) throw new Error('CV contains no readable text. Upload a text-based PDF, DOCX or TXT.');

      const cvInfo = await this.ai.extractCVInfo(cvDoc.content);
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
      const matchRate = validateAndAggregateReview(evaluation.criteria);
      return {
        extractedInfo: cvInfo as { name?: string },
        evaluation: { ...evaluation, strengths: evaluation.strengths || [], improvements: evaluation.gaps || [], recommendations: [] },
        matchRate,
      };
    } catch (error) {
      logger.debug('CV evaluation failed', { error });
      throw error;
    }
  }
}

export default new CVEvaluator();
