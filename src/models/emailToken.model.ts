import mongoose, { Document, Schema } from 'mongoose';

export type EmailTokenPurpose = 'verify-email' | 'reset-password';

export interface IEmailToken extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  purpose: EmailTokenPurpose;
  expiresAt: Date;
  usedAt?: Date;
}

const EmailTokenSchema = new Schema<IEmailToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    purpose: { type: String, enum: ['verify-email', 'reset-password'], required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.model<IEmailToken>('EmailToken', EmailTokenSchema);
