import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'user' | 'admin';

export interface IUser extends Document {
  email: string;
  displayName: string;
  passwordHash?: string;
  googleSub?: string;
  role: UserRole;
  isEmailVerified: boolean;
  isActive: boolean;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, select: false },
    googleSub: { type: String, unique: true, sparse: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
    isEmailVerified: { type: Boolean, default: false, required: true },
    isActive: { type: Boolean, default: true, required: true },
  },
  { timestamps: true },
);

export default mongoose.model<IUser>('User', UserSchema);
