import Document from '../../models/document.model';
import Evaluation from '../../models/evaluation.model';
import JobDescription from '../../models/jobDescription.model';
import { ReviewDescription, ReviewResult } from './review.types';

export const reviewRepository = {
  findCvDocument: (id: string) => Document.findById(id),
  findJobDescription: async (id: string): Promise<ReviewDescription | null> => {
    const job = await JobDescription.findById(id);
    return job ? job.toObject() as ReviewDescription : null;
  },
  markProcessing: (id: string, retrying: boolean) => Evaluation.findOneAndUpdate(
    { _id: id, status: { $in: retrying ? ['queued', 'failed', 'processing'] : ['queued', 'failed'] } },
    { status: 'processing' },
  ),
  complete: (id: string, candidateName: string | undefined, result: ReviewResult) =>
    Evaluation.findOneAndUpdate({ _id: id, status: 'processing' }, { status: 'completed', candidateName, result }, { omitUndefined: true }),
  fail: (id: string, message: string) => Evaluation.findByIdAndUpdate(id, { status: 'failed', error: message }),
  retry: (id: string) => Evaluation.findByIdAndUpdate(id, { status: 'queued', $unset: { error: 1 } }),
};
