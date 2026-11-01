import mongoose, { Document, Schema } from 'mongoose';

export interface IAuthSession extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  csrfHash: string;
  expiresAt: Date;
  createdAt: Date;
}

const AuthSessionSchema = new Schema<IAuthSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    csrfHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);

export default mongoose.model<IAuthSession>('AuthSession', AuthSessionSchema);
