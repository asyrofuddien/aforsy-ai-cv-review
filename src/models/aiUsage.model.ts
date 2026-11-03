import mongoose, { Schema } from 'mongoose';

export interface IAiUsage {
  callId: string;
  referenceType: 'evaluation' | 'cv_matcher' | 'unattributed';
  referenceId?: mongoose.Types.ObjectId;
  stage: string;
  attempt: number;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  usageAvailability: 'reported' | 'unknown';
  latencyMs: number;
  requestId?: string;
  finishReason?: string;
  status: 'succeeded' | 'failed';
  failureCode?: string;
  createdAt: Date;
}

const AiUsageSchema = new Schema<IAiUsage>(
  {
    callId: { type: String, required: true },
    referenceType: {
      type: String,
      enum: ['evaluation', 'cv_matcher', 'unattributed'],
      required: true,
    },
    referenceId: { type: Schema.Types.ObjectId, index: true },
    stage: { type: String, required: true, maxlength: 80 },
    attempt: { type: Number, required: true, min: 1 },
    provider: { type: String, required: true, maxlength: 40 },
    model: { type: String, required: true, maxlength: 128 },
    inputTokens: { type: Number, min: 0 },
    outputTokens: { type: Number, min: 0 },
    usageAvailability: {
      type: String,
      enum: ['reported', 'unknown'],
      required: true,
    },
    latencyMs: { type: Number, required: true, min: 0 },
    requestId: { type: String, maxlength: 128 },
    finishReason: { type: String, maxlength: 80 },
    status: { type: String, enum: ['succeeded', 'failed'], required: true },
    failureCode: { type: String, maxlength: 80 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiUsageSchema.index({ callId: 1, attempt: 1 }, { unique: true });
AiUsageSchema.index({ referenceType: 1, referenceId: 1, createdAt: -1 });
AiUsageSchema.index({ createdAt: -1, provider: 1, model: 1 });

export default mongoose.model<IAiUsage>('AiUsage', AiUsageSchema);
