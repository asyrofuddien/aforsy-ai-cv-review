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
const matchingLogger = appLogger.child({ scope: 'review-matching' });

async function runMatchingStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  matchingLogger.info('Matching stage started', { stage });
  try {
    const result = await operation();
    matchingLogger.info('Matching stage completed', {
      stage,
      durationMs: Math.round(performance.now() - started),
    });
    return result;
  } catch (error) {
    matchingLogger.error('Matching stage failed', {
      stage,
      durationMs: Math.round(performance.now() - started),
      error,
    });
    throw error;
  }
}

const jobMatcher = {
  async findMatches(profile: unknown) {
    const candidate = profile && typeof profile === 'object' ? profile as CandidateForMatching : {};
    const roles = await runMatchingStage('suggest job roles from reviewed CV', () => matcherAI.RoleSuggestion(candidate));
    matchingLogger.info('Suggested role candidates ready', { roleCount: roles.suggested_roles.length });
    const listings = await runMatchingStage('search providers and retrieve job details', () => jobsService.findJobs(roles));
    matchingLogger.info('Job listings retrieved', { listingCount: listings.length });
    const jobs = await runMatchingStage('score job listings against reviewed CV', () => jobsService.matchWithJobs(candidate, listings));
    matchingLogger.info('Job matching results ready', { matchCount: jobs.length });
    return { suggestedRoles: roles.suggested_roles, jobs };
  },
};

export const reviewWorkflow = createReviewWorkflow({ repository: reviewRepository, evaluator: cvEvaluator, summary: reviewAI, jobMatcher, logger: appLogger.child({ scope: 'review' }) });
