import mongoose, { Document, Schema } from 'mongoose';

export interface IDocument extends Document {
  filename: string;
  originalName: string;
  mimeType: string;
  path: string;
  size: number;
  content?: string;
  type: 'cv' | 'project';
  uploadedAt: Date;
}

const DocumentSchema = new Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  path: { type: String, required: true },
  size: { type: Number, required: true },
  content: { type: String },
  type: {
    type: String,
    enum: ['cv', 'project'],
    required: true,
  },
  uploadedAt: { type: Date, default: Date.now },
});

export default mongoose.model<IDocument>('Document', DocumentSchema);
