import Document from '../../models/document.model';
import Evaluation from '../../models/evaluation.model';
import JobDescription from '../../models/jobDescription.model';
import User from '../../models/user.model';
import { ReviewDescription, ReviewResult } from './review.types';

export const reviewRepository = {
  findCvDocument: (id: string) => Document.findById(id),
  findReviewOwner: async (id: string) => {
    const evaluation = await Evaluation.findById(id).select('userId locale');
    if (!evaluation?.userId) return null;
    const user = await User.findById(evaluation.userId).select('email displayName');
    return user ? { user, locale: evaluation.locale } : null;
  },
  findJobDescription: async (id: string): Promise<ReviewDescription | null> => {
    const job = await JobDescription.findById(id);
    return job ? job.toObject() as ReviewDescription : null;
  },
  markProcessing: (id: string, retrying: boolean) => Evaluation.findOneAndUpdate(
    { _id: id, status: { $in: retrying ? ['queued', 'failed', 'processing'] : ['queued', 'failed'] } },
    { status: 'processing' },
  ),
  complete: (id: string, candidateName: string | undefined, result: ReviewResult, matchingProfile?: unknown) =>
    Evaluation.findOneAndUpdate({ _id: id, status: 'processing' }, { status: 'completed', candidateName, result, matchingProfile }, { omitUndefined: true }),
  fail: (id: string, message: string) => Evaluation.findByIdAndUpdate(id, { status: 'failed', error: message }),
  retry: (id: string) => Evaluation.findByIdAndUpdate(id, { status: 'queued', $unset: { error: 1 } }),
};
