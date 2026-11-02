export interface ReviewCriterion {
  name: string;
  score: number;
  evidence: string;
  suggestion: string;
}

export function validateAndAggregateReview(input: unknown): number {
  const criteria = input as ReviewCriterion[];
  if (!Array.isArray(criteria) || criteria.length < 6 || criteria.some(item =>
    !item || typeof item.name !== 'string' || typeof item.score !== 'number' || !Number.isFinite(item.score) ||
    item.score < 0 || item.score > 5 || typeof item.evidence !== 'string' || typeof item.suggestion !== 'string')) {
    throw new Error('AI returned an incomplete review. Please retry.');
  }
  return Math.round(criteria.reduce((sum, item) => sum + item.score, 0) / criteria.length * 20);
}
