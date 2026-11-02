import appLogger from '../../utils/logger';
import { ReviewAIService } from './review.ai';
import cvEvaluator from '../../services/evaluation/cv.evaluator';
import { reviewRepository } from './review.repository';
import { createReviewWorkflow } from './review.workflow';

const reviewAI = new ReviewAIService();
export const reviewWorkflow = createReviewWorkflow({ repository: reviewRepository, evaluator: cvEvaluator, summary: reviewAI, logger: appLogger.child({ scope: 'review' }) });
