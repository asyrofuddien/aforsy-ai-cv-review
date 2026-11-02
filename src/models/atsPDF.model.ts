import mongoose, { Document, Schema } from 'mongoose';

export interface ICvAts extends Document {
  code_id?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  legacyUnclaimed: boolean;
  html_file?: string;
  pdf_file?: string;
  html_text?: string;
  file_name?: string;
  createdAt: Date;
}

const CvAtsSchema = new Schema(
  {
    code_id: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: false,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    legacyUnclaimed: { type: Boolean, default: false, index: true },
    html_file: {
      type: String,
    },
    pdf_file: {
      type: String,
    },
    html_text: {
      type: String,
    },
    file_name: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICvAts>('ats_pdf', CvAtsSchema);
