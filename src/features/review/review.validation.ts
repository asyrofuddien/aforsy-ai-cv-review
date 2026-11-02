import { ReviewCriterion, ReviewStrength, RequirementMatch, validateAndAggregateReview } from './review.scoring';

export const CRITERION_IDS = ['structure', 'clarity', 'experience', 'impact', 'completeness', 'language'] as const;

export interface ReviewAnalysis {
  schemaVersion: 2;
  criteria: ReviewCriterion[];
  strengths: ReviewStrength[];
  gaps: string[];
  requirementMatches: RequirementMatch[];
  feedback: string;
  missing_information: string[];
}

const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, allowEmpty = false): value is string => typeof value === 'string' && (allowEmpty || !!value.trim());
const quotedIn = (quote: unknown, source: string) => text(quote) && normalize(source).includes(normalize(quote));
const invalid = (): never => { throw new Error('AI returned an incomplete review or unsupported evidence. Please retry.'); };

// Never silently accept invented source quotes or turn missing evidence into a zero score.
export function validateReviewAnalysis(value: unknown, cvText: string, jobText?: string): ReviewAnalysis {
  if (!record(value) || value.schemaVersion !== 2 || !text(value.feedback) || !Array.isArray(value.criteria) || value.criteria.length !== 6) return invalid();
  const ids = new Set<string>();
  for (const item of value.criteria) {
    if (!record(item) || !text(item.id) || !CRITERION_IDS.includes(item.id as typeof CRITERION_IDS[number]) || ids.has(item.id) ||
      !text(item.name) || !text(item.section) || !text(item.rationale) || !text(item.suggestion) || !text(item.exampleRevision, true) ||
      !['high', 'medium', 'low'].includes(String(item.priority))) return invalid();
    ids.add(item.id);
    if (item.evidenceStatus === 'quoted') {
      if (!quotedIn(item.evidence, cvText)) return invalid();
    } else if (item.evidenceStatus === 'not_visible' || item.evidenceStatus === 'not_assessable') {
      if (item.evidence !== '') return invalid();
    } else return invalid();
    if (item.evidenceStatus === 'not_assessable') {
      if (item.score !== null) return invalid();
    } else if (typeof item.score !== 'number' || !Number.isInteger(item.score) || item.score < 0 || item.score > 5) return invalid();
  }
  if (!Array.isArray(value.strengths) || value.strengths.some(item => !record(item) || !text(item.title) || !text(item.section) || !quotedIn(item.evidence, cvText))) return invalid();
  if (!Array.isArray(value.missing_information) || value.missing_information.some(item => !text(item))) return invalid();
  if (!Array.isArray(value.requirementMatches)) return invalid();
  if (!jobText?.trim() && value.requirementMatches.length) return invalid();
  if (jobText?.trim() && !value.requirementMatches.length) return invalid();
  const requirements = new Set<string>();
  for (const item of value.requirementMatches) {
    if (!record(item) || !quotedIn(item.requirement, jobText || '') || !text(item.explanation) || !['supported', 'partial', 'not_visible'].includes(String(item.status))) return invalid();
    const key = normalize(item.requirement as string);
    if (requirements.has(key)) return invalid();
    requirements.add(key);
    if (item.status === 'not_visible' ? item.evidence !== '' : !quotedIn(item.evidence, cvText)) return invalid();
  }
  validateAndAggregateReview(value.criteria);
  const criteria = value.criteria as unknown as ReviewCriterion[];
  return {
    schemaVersion: 2,
    criteria: CRITERION_IDS.map(id => criteria.find(item => item.id === id)!),
    strengths: value.strengths as ReviewStrength[],
    gaps: criteria.filter(item => item.priority !== 'low').map(item => item.suggestion),
    requirementMatches: value.requirementMatches as RequirementMatch[],
    feedback: value.feedback,
    missing_information: value.missing_information as string[],
  };
}
