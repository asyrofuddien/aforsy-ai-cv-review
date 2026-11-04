import mongoose, { Document, Schema } from 'mongoose';
import { EvaluationResult, EvaluationStatus } from '../types/evaluation.types';

export interface IEvaluation extends Document {
  candidateName?: string;
  matchingProfile?: Record<string, unknown>;
  matchingRetryOperationId?: mongoose.Types.ObjectId;
  lastMatchingRetryOperationId?: mongoose.Types.ObjectId;
  cvDocumentId: mongoose.Types.ObjectId;
  jobDescriptionId?: mongoose.Types.ObjectId;
  locale?: 'id' | 'en';
  evaluationMode: 'general' | 'job_specific';
  status: EvaluationStatus;
  result?: EvaluationResult;
  error?: string;
  queueJobId?: string;
  code_id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  legacyUnclaimed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EvaluationSchema = new Schema(
  {
    candidateName: { type: String },
    matchingProfile: { type: Schema.Types.Mixed, select: false },
    matchingRetryOperationId: { type: Schema.Types.ObjectId, ref: 'AiOperation' },
    lastMatchingRetryOperationId: { type: Schema.Types.ObjectId, ref: 'AiOperation' },
    cvDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    code_id: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: false,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    legacyUnclaimed: { type: Boolean, default: false, index: true },
    jobDescriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'JobDescription',
      required: false,
      default: undefined,
    },
    locale: { type: String, enum: ['id','en'], default: 'en' },
    evaluationMode: { type: String, enum: ['general', 'job_specific'], default: 'job_specific', required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      required: true,
    },
    result: {
      locale: {type:String,enum:['id','en']},
      schemaVersion: Number,
      strengths: [{ title: String, evidence: String, section: String }],
      gaps: [String],
      requirementMatches: [{ requirement: String, status: { type: String, enum: ['supported', 'partial', 'not_visible'] }, evidence: String, explanation: String }],
      cvMatchRate: Number,
      cvFeedback: String,
      projectScore: Number,
      projectFeedback: String,
      overallSummary: String,
      recommendation: String,
      mode: { type: String, enum: ['general', 'job_specific'] },
      jobDescription: {
        id: String,
        title: String,
        company: String,
        text: String,
      },
      missingInformation: [String],
      criteria: [{
        id: String, name: String, score: { type: Number, default: null }, evidence: String, suggestion: String,
        evidenceStatus: { type: String, enum: ['quoted', 'not_visible', 'not_assessable'] },
        section: String, rationale: String,
        priority: { type: String, enum: ['high', 'medium', 'low'] }, exampleRevision: String,
      }],
      suggestedRoles: [String],
      jobMatches: [Schema.Types.Mixed],
      jobMatchingStatus: { type: String, enum: ['completed', 'failed', 'not_run'] },
      jobMatchingError: String,
      detailedScores: {
        technicalSkillsMatch: Number,
        experienceLevel: Number,
        relevantAchievements: Number,
        culturalFit: Number,
        correctness: Number,
        codeQuality: Number,
        resilience: Number,
        documentation: Number,
        creativity: Number,
      },
    },
    error: String,
    queueJobId: { type: String },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IEvaluation>('Evaluation', EvaluationSchema);
