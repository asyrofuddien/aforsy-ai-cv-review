import Document from '../../models/document.model';
import CvMatcher from '../../models/cvMatcher.model';
import { MatcherDocument, MatcherResult } from './matcher.types';

export const matcherRepository = {
  markProcessing: (id: string) =>
    CvMatcher.findOneAndUpdate(
      { _id: id, status: { $in: ['queued', 'failed'] } },
      { status: 'processing' },
    ),
  findDocument: (id: string): Promise<MatcherDocument | null> =>
    Document.findById(id) as unknown as Promise<MatcherDocument | null>,
  setCandidateName: (id: string, name: string) =>
    CvMatcher.findByIdAndUpdate(id, { 'result.user_profile.name': name }),
  complete: (id: string, result: MatcherResult) =>
    CvMatcher.findOneAndUpdate({ _id: id, status: 'processing' }, { status: 'completed', result }),
  fail: (id: string, message: string) =>
    CvMatcher.findByIdAndUpdate(id, { status: 'failed', error: message }),
  retry: (id: string) =>
    CvMatcher.findByIdAndUpdate(id, { status: 'queued', $unset: { error: 1 } }),
};
