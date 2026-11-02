import mongoose, { Document, Schema } from 'mongoose';

export type AtsTemplateStatus = 'draft' | 'active' | 'inactive' | 'archived';
export type AtsTemplateVariant = 'classic' | 'modern' | 'compact';

export interface IAtsTemplate extends Document {
  id: string;
  name: string;
  description: string;
  version: string;
  status: AtsTemplateStatus;
  layout: {
    variant: AtsTemplateVariant;
    columns: 1;
    fontFamily: string;
    pageMargin: string;
    density: 'standard' | 'compact';
    headingColor: string;
    accentColor: string;
  };
  preview: { sampleName: string; sampleRole: string; summary: string };
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
}

const AtsTemplateSchema = new Schema<IAtsTemplate>({
  id: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, trim: true, maxlength: 300 },
  version: { type: String, required: true, trim: true, maxlength: 24 },
  status: { type: String, enum: ['draft', 'active', 'inactive', 'archived'], default: 'draft', required: true, index: true },
  layout: {
    variant: { type: String, enum: ['classic', 'modern', 'compact'], required: true },
    columns: { type: Number, enum: [1], default: 1, required: true },
    fontFamily: { type: String, enum: ['Arial, Helvetica, sans-serif'], default: 'Arial, Helvetica, sans-serif', required: true },
    pageMargin: { type: String, enum: ['0.3in', '0.4in', '0.5in'], default: '0.4in', required: true },
    density: { type: String, enum: ['standard', 'compact'], required: true },
    headingColor: { type: String, match: /^#[0-9a-fA-F]{6}$/, required: true },
    accentColor: { type: String, match: /^#[0-9a-fA-F]{6}$/, required: true },
  },
  preview: {
    sampleName: { type: String, required: true, trim: true, maxlength: 80 },
    sampleRole: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, required: true, trim: true, maxlength: 240 },
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });

export default mongoose.model<IAtsTemplate>('AtsTemplate', AtsTemplateSchema);
