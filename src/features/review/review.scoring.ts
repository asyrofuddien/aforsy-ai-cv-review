export interface ReviewCriterion {
  id?: string;
  name: string;
  score: number | null;
  evidence: string;
  suggestion: string;
  evidenceStatus?: 'quoted' | 'not_visible' | 'not_assessable';
  section?: string;
  rationale?: string;
  priority?: 'high' | 'medium' | 'low';
  exampleRevision?: string;
}

export interface ReviewStrength {
  title: string;
  evidence: string;
  section: string;
}
export interface RequirementMatch {
  requirement: string;
  status: 'supported' | 'partial' | 'not_visible';
  evidence: string;
  explanation: string;
}

export function validateAndAggregateReview(input: unknown): number {
  const criteria = input as ReviewCriterion[];
  if (
    !Array.isArray(criteria) ||
    criteria.length !== 6 ||
    criteria.some(
      (item) =>
        !item ||
        typeof item.name !== 'string' ||
        !(
          (item.score === null && item.evidenceStatus === 'not_assessable') ||
          (typeof item.score === 'number' &&
            Number.isFinite(item.score) &&
            item.score >= 0 &&
            item.score <= 5)
        ) ||
        typeof item.evidence !== 'string' ||
        typeof item.suggestion !== 'string',
    )
  ) {
    throw new Error('AI returned an incomplete review. Please retry.');
  }
  const assessed = criteria.filter(
    (item): item is ReviewCriterion & { score: number } => item.score !== null,
  );
  if (!assessed.length)
    throw new Error('AI returned an incomplete review. No criteria could be assessed.');
  return Math.round((assessed.reduce((sum, item) => sum + item.score, 0) / assessed.length) * 20);
}
