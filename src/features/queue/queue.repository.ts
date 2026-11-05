import Evaluation from '../../models/evaluation.model';
import cvMatcherModel from '../../models/cvMatcher.model';
import { CVMatcherRequest, EvaluationRequest } from '../../types/evaluation.types';

export const queueRepository = {
  async createReview(data: EvaluationRequest, userId: string) {
    const record = new Evaluation({
      cvDocumentId: data.cvDocumentId,
      jobDescriptionId: data.jobDescriptionId,
      candidateName: data.candidateName,
      locale: data.locale || 'en',
      evaluationMode: data.jobDescriptionId || data.jobDescriptionText ? 'job_specific' : 'general',
      userId,
      status: 'queued',
    });
    record.queueJobId = record.id;
    await record.save();
    return record;
  },
  async createMatcher(data: CVMatcherRequest, userId: string) {
    const record = new cvMatcherModel({
      cvDocumentId: data.cvDocumentId,
      userId,
      status: 'queued',
    });
    record.queueJobId = record.id;
    await record.save();
    return record;
  },
  markReviewEnqueueFailed: (id: string, message: string) =>
    Evaluation.findByIdAndUpdate(id, { status: 'failed', error: message }),
  markMatcherEnqueueFailed: (id: string, message: string) =>
    cvMatcherModel.findByIdAndUpdate(id, { status: 'failed', error: message }),
};
