import { AppError } from '../../../middlewares/error.middleware';
import { mongoCvDraftRepository } from './cv-draft.repository';
import type { CvDraftRepository } from './cv-draft.repository';

export function createCvDraftService(repository: CvDraftRepository) {
  return {
    getDraft(ownerId: string) {
      return repository.findByOwner(ownerId);
    },

    saveDraft(ownerId: string, requestedOwnerId: string | undefined, data: Record<string, unknown>) {
      if (requestedOwnerId && requestedOwnerId !== ownerId) {
        throw new AppError('Draft owner no longer matches the active account.', 403);
      }
      return repository.upsertForOwner(ownerId, data);
    },

    deleteDraft(ownerId: string) {
      return repository.deleteByOwner(ownerId);
    },
  };
}

export const cvDraftService = createCvDraftService(mongoCvDraftRepository);
