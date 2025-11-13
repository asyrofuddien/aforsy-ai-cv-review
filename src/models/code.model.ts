import mongoose, { Document, Schema } from 'mongoose';

export interface ICode extends Document {
  code: string;
}

const CodeSchema = new Schema({
  code: { type: String, required: true },
});

export default mongoose.model<ICode>('Code', CodeSchema);
