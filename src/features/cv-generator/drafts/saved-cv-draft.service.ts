import mongoose from 'mongoose';
import { AppError } from '../../../middlewares/error.middleware';
import CvDraft from '../../../models/cvDraft.model';
import SavedCvDraft from '../../../models/savedCvDraft.model';

const cleanName = (name: unknown) => {
  if (typeof name !== 'string' || !name.trim()) throw new AppError('Draft name is required.', 400);
  return name.trim().slice(0, 80);
};

export const savedCvDraftService = {
  async list(ownerId: string) {
    // Preserve each user's existing autosaved draft as their first named draft.
    const legacy = await CvDraft.findOne({ userId: ownerId }).lean();
    if (legacy && !(await SavedCvDraft.exists({ legacyDraftId: legacy._id }))) {
      try {
        await SavedCvDraft.updateOne(
          { legacyDraftId: legacy._id },
          {
            $setOnInsert: {
              userId: legacy.userId,
              name: 'CV draft',
              data: legacy.data,
              legacyDraftId: legacy._id,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
      }
    }
    const drafts = await SavedCvDraft.find({ userId: ownerId })
      .sort({ updatedAt: -1 })
      .select('_id name updatedAt createdAt')
      .lean();
    return drafts;
  },

  async get(ownerId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Draft not found.', 404);
    const draft = await SavedCvDraft.findOne({ _id: id, userId: ownerId }).lean();
    if (!draft) throw new AppError('Draft not found.', 404);
    return draft;
  },

  async create(ownerId: string, name: unknown, data: Record<string, unknown>) {
    const count = await SavedCvDraft.countDocuments({ userId: ownerId });
    if (count >= 50) throw new AppError('You can save up to 50 CV drafts.', 409);
    return SavedCvDraft.create({ userId: ownerId, name: cleanName(name), data });
  },

  async update(
    ownerId: string,
    id: string,
    updates: { name?: unknown; data?: Record<string, unknown> },
  ) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Draft not found.', 404);
    const set: Record<string, unknown> = {};
    if (updates.name !== undefined) set.name = cleanName(updates.name);
    if (updates.data !== undefined) set.data = updates.data;
    if (!Object.keys(set).length) throw new AppError('No draft changes were provided.', 400);
    const draft = await SavedCvDraft.findOneAndUpdate(
      { _id: id, userId: ownerId },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!draft) throw new AppError('Draft not found.', 404);
    return draft;
  },

  async delete(ownerId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Draft not found.', 404);
    const draft = await SavedCvDraft.findOne({ _id: id, userId: ownerId })
      .select('legacyDraftId')
      .lean();
    if (!draft) throw new AppError('Draft not found.', 404);
    if (draft.legacyDraftId) await CvDraft.deleteOne({ _id: draft.legacyDraftId, userId: ownerId });
    const result = await SavedCvDraft.deleteOne({ _id: id, userId: ownerId });
    if (!result.deletedCount) throw new AppError('Draft not found.', 404);
  },
};
