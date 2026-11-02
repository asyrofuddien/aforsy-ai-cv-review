
export interface ReviewJobPayload {
  evaluationId: string;
  cvDocumentId: string;
  jobDescriptionId?: string;
  jobDescriptionText?: string;
  candidateName?: string;
  locale?: 'id' | 'en';
  attempt?: number;
  maxAttempts?: number;
}

export interface ReviewDescription {
  id: string;
  title: string;
  company: string;
  description: string;
  requirements: unknown;
  scoringWeights?: Record<string, number>;
}

export interface ReviewEvaluation {
  extractedInfo?: { name?: string };
  matchRate: number;
  evaluation: {
    criteria: Array<{ name: string; score: number; evidence: string; suggestion: string }>;
    feedback: string;
    scores?: Record<string, number>;
    missing_information?: string[];
  };
}

export interface ReviewResult {
  locale: 'id' | 'en';
  cvMatchRate: number;
  criteria: Array<{ name: string; score: number; evidence: string; suggestion: string }>;
  jobMatches: unknown[];
  suggestedRoles: string[];
  jobMatchingStatus: 'completed' | 'failed' | 'not_run';
  jobMatchingError?: string;
  cvFeedback: string;
  overallSummary: string;
  recommendation?: string;
  mode: 'general' | 'job_specific';
  jobDescription?: { id: string; title: string; company: string; text?: string };
  missingInformation: string[];
  detailedScores?: Record<string, number>;
  scoringWeightsUsed?: Record<string, number>;
}
