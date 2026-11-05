import type { ICvDraft } from '../../../models/cvDraft.model';
import CvDraft from '../../../models/cvDraft.model';

export interface CvDraftRepository {
  findByOwner(_ownerId: string): Promise<Pick<ICvDraft, 'data' | 'updatedAt'> | null>;
  upsertForOwner(
    _ownerId: string,
    _data: Record<string, unknown>,
  ): Promise<Pick<ICvDraft, 'data' | 'updatedAt'>>;
  deleteByOwner(_ownerId: string): Promise<void>;
}

export const mongoCvDraftRepository: CvDraftRepository = {
  findByOwner: (ownerId) => CvDraft.findOne({ userId: ownerId }).lean(),

  upsertForOwner: async (ownerId, data) => {
    const draft = await CvDraft.findOneAndUpdate(
      { userId: ownerId },
      { $set: { data }, $setOnInsert: { userId: ownerId } },
      { upsert: true, new: true, runValidators: true },
    );
    return draft;
  },

  deleteByOwner: async (ownerId) => {
    await CvDraft.deleteOne({ userId: ownerId });
  },
};
