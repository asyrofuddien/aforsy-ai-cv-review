import appLogger from '../../utils/logger';
import { ReviewAIService } from './review.ai';
import cvEvaluator from '../../services/evaluation/cv.evaluator';
import { reviewRepository } from './review.repository';
import { createReviewWorkflow } from './review.workflow';
import { MatcherAIService } from '../cv-matcher/matcher.ai';
import { jobsService } from '../jobs/jobs.service';
import type { CandidateForMatching } from '../jobs/model/job.types';

const reviewAI = new ReviewAIService();
const matcherAI = new MatcherAIService();
const jobMatcher = {
  async findMatches(profile: unknown) {
    const candidate = profile && typeof profile === 'object' ? profile as CandidateForMatching : {};
    const roles = await matcherAI.RoleSuggestion(candidate);
    const listings = await jobsService.findJobs(roles);
    const jobs = await jobsService.matchWithJobs(candidate, listings);
    return { suggestedRoles: roles.suggested_roles, jobs };
  },
};

export const reviewWorkflow = createReviewWorkflow({ repository: reviewRepository, evaluator: cvEvaluator, summary: reviewAI, jobMatcher, logger: appLogger.child({ scope: 'review' }) });
