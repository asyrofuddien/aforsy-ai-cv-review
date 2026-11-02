import mongoose, { Document, Schema } from 'mongoose';

export interface ISavedCvDraft extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  data: Record<string, unknown>;
  legacyDraftId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SavedCvDraftSchema = new Schema<ISavedCvDraft>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    data: { type: Schema.Types.Mixed, required: true },
    legacyDraftId: { type: Schema.Types.ObjectId, sparse: true, unique: true },
  },
  { timestamps: true },
);

SavedCvDraftSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model<ISavedCvDraft>('SavedCvDraft', SavedCvDraftSchema);
