import mongoose, { Document, Schema } from 'mongoose';

export type JobOperationStage = 'search' | 'scoring';
export type JobOperationStatus = 'completed' | 'partial' | 'failed' | 'no_matches' | 'no_query';

export interface IJobOperationMetric extends Document {
  referenceType: 'evaluation' | 'cv_matcher';
  referenceId: mongoose.Types.ObjectId;
  stage: JobOperationStage;
  attempt: number;
  status: JobOperationStatus;
  provider: string;
  durationMs: number;
  roleCount: number;
  searchAttempts: number;
  searchSucceeded: number;
  searchFailed: number;
  listingsFound: number;
  detailAttempts: number;
  detailUnavailable: number;
  detailFailed: number;
  listingsDeduplicated: number;
  enhancementFallbacks: number;
  listingsReadyForScoring: number;
  scoringFailed: number;
  createdAt: Date;
  updatedAt: Date;
}

const JobOperationMetricSchema = new Schema<IJobOperationMetric>(
  {
    referenceType: {
      type: String,
      enum: ['evaluation', 'cv_matcher'],
      required: true,
    },
    referenceId: { type: Schema.Types.ObjectId, required: true },
    stage: { type: String, enum: ['search', 'scoring'], required: true },
    attempt: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['completed', 'partial', 'failed', 'no_matches', 'no_query'],
      required: true,
    },
    provider: { type: String, required: true, maxlength: 40 },
    durationMs: { type: Number, required: true, min: 0 },
    roleCount: { type: Number, default: 0, min: 0 },
    searchAttempts: { type: Number, default: 0, min: 0 },
    searchSucceeded: { type: Number, default: 0, min: 0 },
    searchFailed: { type: Number, default: 0, min: 0 },
    listingsFound: { type: Number, default: 0, min: 0 },
    detailAttempts: { type: Number, default: 0, min: 0 },
    detailUnavailable: { type: Number, default: 0, min: 0 },
    detailFailed: { type: Number, default: 0, min: 0 },
    listingsDeduplicated: { type: Number, default: 0, min: 0 },
    enhancementFallbacks: { type: Number, default: 0, min: 0 },
    listingsReadyForScoring: { type: Number, default: 0, min: 0 },
    scoringFailed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

JobOperationMetricSchema.index(
  { referenceType: 1, referenceId: 1, stage: 1, attempt: 1 },
  { unique: true },
);
JobOperationMetricSchema.index({ createdAt: -1, status: 1 });

export default mongoose.model<IJobOperationMetric>('JobOperationMetric', JobOperationMetricSchema);
