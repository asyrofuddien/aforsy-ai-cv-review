import { JobListing } from '../../../types/evaluation.types';

export type { JobListing };

export interface RoleSuggestion {
  suggested_roles: string[];
  seniority: string;
}

export interface JobSearchParams {
  query?: string;
  location?: string;
  experienceLevels?: string;
  workplaceTypes?: string;
  datePosted?: string;
  geoId?: string;
  employmentTypes?: string;
}

export interface RapidApiSearchResponse {
  data?: Array<{ id: string }>;
}

export interface RapidApiJobDetailsResponse {
  data?: {
    description?: string;
    title?: string;
    companyName?: string;
    location?: string;
    employmentType?: string;
    seniorityLevel?: string;
    datePosted?: string;
    postedTimeAgo?: string;
    linkedinUrl?: string;
  };
}

export interface CandidateForMatching {
  skills?: string[];
  seniority?: string;
  work_experience?: Array<{ description?: string; achievements?: string[] | string }>;
}

export interface ScoredJobListing extends JobListing {
  skill_match: number;
  experience_match: number;
  responsibility_match: number;
  score: number;
  grade: string;
  explanation: string;
}
