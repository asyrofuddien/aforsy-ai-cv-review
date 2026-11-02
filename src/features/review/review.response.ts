import { ReviewDescription, ReviewEvaluation, ReviewResult } from './review.types';

export function mapReviewResult(
  evaluation: ReviewEvaluation,
  description: ReviewDescription | null,
  pastedDescription: string | undefined,
  locale: 'id' | 'en',
  summary: { overall_summary?: string; recommendation?: string; missing_information?: string[] } | null,
): ReviewResult {
  const mode = description || pastedDescription ? 'job_specific' : 'general';
  return {
    locale,
    cvMatchRate: evaluation.matchRate,
    criteria: evaluation.evaluation.criteria,
    jobMatches: [],
    suggestedRoles: [],
    jobMatchingStatus: 'not_run',
    cvFeedback: evaluation.evaluation.feedback,
    overallSummary: summary?.overall_summary || evaluation.evaluation.feedback,
    recommendation: mode === 'general' ? '' : summary?.recommendation,
    mode,
    jobDescription: description
      ? { id: description.id, title: description.title, company: description.company, text: JSON.stringify({ description: description.description, requirements: description.requirements }) }
      : pastedDescription ? { id: '', title: 'Pasted job description', company: '', text: pastedDescription } : undefined,
    missingInformation: summary?.missing_information || evaluation.evaluation.missing_information || [],
    detailedScores: { ...evaluation.evaluation.scores },
    scoringWeightsUsed: description?.scoringWeights,
  };
}
