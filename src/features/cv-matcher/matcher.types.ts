import { ScoredJobListing, RoleSuggestion } from '../jobs/model/job.types';

export interface MatcherJobPayload {
  cvMatcherId: string;
  cvDocumentId: string;
  attempt?: number;
  maxAttempts?: number;
}

export interface MatcherDocument {
  filename: string;
  path: string;
  mimeType: string;
  content?: string;
}

export interface ExtractedCv {
  name?: string;
  skills?: string[];
  seniority?: string;
  work_experience?: Array<{ description?: string; achievements?: string[] | string }>;
  [key: string]: unknown;
}

export interface MatcherResult {
  user_profile: { name?: string; seniority?: string; primary_skills?: string[] };
  suggested_roles?: string[];
  jobs: ScoredJobListing[];
  summary: unknown;
}

export type { RoleSuggestion };
