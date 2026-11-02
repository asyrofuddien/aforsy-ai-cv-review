import { JobListing } from '../../../types/evaluation.types';

export type { JobListing };

export interface RoleSuggestion {
  suggested_roles: string[];
  seniority: string;
}

export interface JobSearchParams {
  query?: string;
  location?: string;
  countryCode?: string;
  experienceLevels?: string;
  workplaceTypes?: string;
  datePosted?: string;
  geoId?: string;
  employmentTypes?: string;
  organizationIds?: string;
  radius?: number;
  sortType?: string;
  remoteOnly?: boolean;
  token?: string;
}

export interface RapidApiSearchResponse {
  data?: Array<{ id: string }>;
  meta?: { nextToken?: string };
}

export interface RapidApiJobDetailsResponse {
  data?: {
    description?: string;
    title?: string;
    companyName?: string;
    company?: string;
    employer?: string;
    location?: string;
    employmentType?: string;
    jobType?: string;
    seniorityLevel?: string;
    datePosted?: string;
    postedAt?: string;
    postedTimeAgo?: string;
    linkedinUrl?: string;
    url?: string;
    applyUrl?: string;
    salaryRange?: string;
  };
}

export interface JobProvider {
  search(params: JobSearchParams): Promise<RapidApiSearchResponse>;
  getDetails(id: string): Promise<RapidApiJobDetailsResponse | null>;
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
