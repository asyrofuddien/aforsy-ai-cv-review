import { matcherWorkflow } from '../../features/cv-matcher';
import { MatcherJobPayload } from '../../features/cv-matcher/matcher.types';
import { reviewWorkflow } from '../../features/review';
import { ReviewJobPayload } from '../../features/review/review.types';

/** @deprecated The worker now calls feature workflows directly. */
class EvaluationService {
  processEvaluation(payload: ReviewJobPayload) { return reviewWorkflow.process(payload); }
  processCvMatcher(payload: MatcherJobPayload) { return matcherWorkflow.process(payload); }
}

export default new EvaluationService();
