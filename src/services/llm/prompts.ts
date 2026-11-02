import { REVIEW_PROMPTS } from '../../features/review/review.prompts';
import { MATCHER_PROMPTS } from '../../features/cv-matcher/matcher.prompts';
import { JOBS_PROMPTS } from '../../features/jobs/jobs.prompts';
import { PROJECT_PROMPTS } from '../../features/project-evaluation/project.prompts';

/** @deprecated Feature workflows own their prompts; retained for legacy imports. */
export const PROMPTS = { ...REVIEW_PROMPTS, ...MATCHER_PROMPTS, ...JOBS_PROMPTS, ...PROJECT_PROMPTS };
