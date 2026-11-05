import { ReviewDescription, ReviewEvaluation, ReviewResult } from './review.types';

export function mapReviewResult(
  evaluation: ReviewEvaluation,
  description: ReviewDescription | null,
  pastedDescription: string | undefined,
  locale: 'id' | 'en',
  summary: {
    overall_summary?: string;
    recommendation?: string;
    missing_information?: string[];
  } | null,
): ReviewResult {
  const mode = description || pastedDescription ? 'job_specific' : 'general';
  return {
    locale,
    schemaVersion: evaluation.evaluation.schemaVersion,
    strengths: evaluation.evaluation.strengths || [],
    gaps: evaluation.evaluation.gaps || [],
    requirementMatches:
      mode === 'job_specific' ? evaluation.evaluation.requirementMatches || [] : [],
    cvMatchRate: evaluation.matchRate,
    criteria: evaluation.evaluation.criteria,
    jobMatches: [],
    suggestedRoles: [],
    jobMatchingStatus: 'not_run',
    cvFeedback: evaluation.evaluation.feedback,
    overallSummary: summary?.overall_summary || evaluation.evaluation.feedback,
    recommendation:
      evaluation.evaluation.schemaVersion === 2 || mode === 'general'
        ? ''
        : summary?.recommendation,
    mode,
    jobDescription: description
      ? {
          id: description.id,
          title: description.title,
          company: description.company,
          text: JSON.stringify({
            description: description.description,
            requirements: description.requirements,
          }),
        }
      : pastedDescription
        ? { id: '', title: 'Pasted job description', company: '', text: pastedDescription }
        : undefined,
    missingInformation: [
      ...new Set([
        ...(evaluation.evaluation.missing_information || []),
        ...(summary?.missing_information || []),
      ]),
    ],
    detailedScores: { ...evaluation.evaluation.scores },
    scoringWeightsUsed:
      evaluation.evaluation.schemaVersion === 2 ? undefined : description?.scoringWeights,
  };
}
