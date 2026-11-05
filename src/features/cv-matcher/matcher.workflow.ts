import {
  ExtractedCv,
  MatcherDocument,
  MatcherJobPayload,
  MatcherResult,
  RoleSuggestion,
} from './matcher.types';
import { JobListing, ScoredJobListing } from '../jobs/model/job.types';

export interface MatcherWorkflowDependencies {
  repository: {
    markProcessing(id: string): Promise<unknown>;
    findDocument(id: string): Promise<MatcherDocument | null>;
    setCandidateName(id: string, name: string): Promise<unknown>;
    complete(id: string, result: MatcherResult): Promise<unknown>;
    fail(id: string, message: string): Promise<unknown>;
    retry?(id: string): Promise<unknown>;
  };
  parser: { parseFile(path: string, mimeType: string): Promise<string> };
  ai: {
    extractCVToJSON(text: string): Promise<ExtractedCv>;
    RoleSuggestion(cv: ExtractedCv): Promise<RoleSuggestion>;
    SummaryRecommendation(
      cv: ExtractedCv,
      roles: RoleSuggestion,
      jobs: JobListing[],
    ): Promise<{ summary: unknown }>;
  };
  jobs: {
    findJobs(roles: RoleSuggestion): Promise<JobListing[]>;
    matchWithJobs(cv: ExtractedCv, jobs: JobListing[]): Promise<ScoredJobListing[]>;
  };
  logger?: {
    debug(message: string, metadata?: unknown): void;
    warn(message: string, metadata?: unknown): void;
  };
}

export function createMatcherWorkflow(dependencies: MatcherWorkflowDependencies) {
  const { repository, parser, ai, jobs, logger } = dependencies;
  return {
    async process(payload: MatcherJobPayload): Promise<MatcherResult | null> {
      try {
        const claimed = await repository.markProcessing(payload.cvMatcherId);
        if (claimed === null) return null;
        const document = await repository.findDocument(payload.cvDocumentId);
        if (!document) throw new Error(`CV Document not found with ID: ${payload.cvDocumentId}`);

        let rawText: string;
        try {
          rawText = await parser.parseFile(document.path, document.mimeType);
        } catch (error) {
          if (!document.content)
            throw new Error(
              `Failed to parse CV file and no cached content available: ${error instanceof Error ? error.message : 'Unknown parser error'}`,
            );
          rawText = document.content;
          logger?.warn('CV parser failed; using cached document text');
        }
        if (!rawText.trim()) throw new Error('CV file is empty or contains no readable text');

        const cv = await ai.extractCVToJSON(rawText);
        if (!cv.name || cv.name === 'Unknown Candidate') {
          const fallbackName = document.filename.split('.')[0].replace(/[-_]/g, ' ').trim();
          cv.name = fallbackName || 'Candidate';
          logger?.warn('Candidate name missing from CV; using filename fallback');
        }
        await repository.setCandidateName(payload.cvMatcherId, cv.name);

        const roles = await ai.RoleSuggestion(cv);
        const listings = await jobs.findJobs(roles);
        const scored = await jobs.matchWithJobs(cv, listings);
        const summary = await ai.SummaryRecommendation(cv, roles, listings);
        const result: MatcherResult = {
          user_profile: { name: cv.name, seniority: roles.seniority, primary_skills: cv.skills },
          suggested_roles: roles.suggested_roles,
          jobs: scored,
          summary: summary.summary,
        };
        await repository.complete(payload.cvMatcherId, result);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if ((payload.attempt ?? 1) < (payload.maxAttempts ?? 1) && repository.retry)
          await repository.retry(payload.cvMatcherId);
        else await repository.fail(payload.cvMatcherId, message);
        throw error;
      }
    },
  };
}
