export interface EvaluationRequest {
  cvDocumentId: string;
  jobDescriptionId: string;
  candidateName?: string;
}

export interface CVMatcherRequest {
  cvDocumentId: string;
}
export interface EvaluationResult {
  cvMatchRate: number;
  cvFeedback: string;
  projectScore: number;
  projectFeedback: string;
  overallSummary: string;
  detailedScores?: DetailedScores;
  recommendation: string;
}

export interface DetailedScores {
  // CV Scores (1-5 each)
  technicalSkillsMatch: number;
  experienceLevel: number;
  relevantAchievements: number;
  culturalFit: number;

  // Project Scores (1-5 each)
  correctness: number;
  codeQuality: number;
  resilience: number;
  documentation: number;
  creativity: number;
}

export type EvaluationStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface EvaluationJob {
  id: string;
  status: EvaluationStatus;
  result?: EvaluationResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobListing {
  title: string;
  company: string;
  location: string;
  salary_range: string; // snake_case sesuai preferensi DB
  job_type: string;
  requirements: string[];
  responsibilities: string[];
  posted_at: string; // ISO date string
  link: string;
  seniority: string;
  job_description: string;
}

export interface CVExtractedInfo {
  name?: string;
  email?: string;
  skills: string[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
}

export interface Experience {
  company: string;
  position: string;
  duration: string;
  description: string;
}

export interface Education {
  institution: string;
  degree: string;
  year: string;
}

export interface Project {
  name: string;
  description: string;
  technologies: string[];
}
