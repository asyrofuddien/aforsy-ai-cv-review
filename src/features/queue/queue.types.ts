import { CVMatcherRequest, EvaluationRequest } from '../../types/evaluation.types';

export type ReviewQueuePayload = EvaluationRequest & { evaluationId: string };
export type MatcherQueuePayload = CVMatcherRequest & { cvMatcherId: string };
export type QueuePayload = ReviewQueuePayload | MatcherQueuePayload;
