import appLogger from '../../utils/logger';
import parserService from '../../services/parser.service';
import { MatcherAIService } from './matcher.ai';
import { jobsService } from '../jobs/jobs.service';
import { matcherRepository } from './matcher.repository';
import { createMatcherWorkflow } from './matcher.workflow';

const matcherAI = new MatcherAIService();
export const matcherWorkflow = createMatcherWorkflow({
  repository: matcherRepository,
  parser: parserService,
  ai: matcherAI,
  jobs: jobsService,
  logger: appLogger.child({ scope: 'cv-matcher' }),
});
