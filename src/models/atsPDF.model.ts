import mongoose, { Document, Schema } from 'mongoose';

export interface ICvAts extends Document {
  code_id: mongoose.Types.ObjectId;
}

const CvAtsSchema = new Schema({
  code_id: {
    type: Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
  },
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
});

export default mongoose.model<ICvAts>('ats_pdf', CvAtsSchema);
