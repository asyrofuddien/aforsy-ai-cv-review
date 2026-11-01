import mongoose, { Document, Schema } from 'mongoose';

export interface ICvDraft extends Document {
  userId: mongoose.Types.ObjectId;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CvDraftSchema = new Schema<ICvDraft>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export default mongoose.model<ICvDraft>('CvDraft', CvDraftSchema);
