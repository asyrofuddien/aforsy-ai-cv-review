import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplate extends Document {
  content: string;
  name: string;
}

const TemplateSchema = new Schema(
  {
    content: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ITemplate>('template', TemplateSchema);
