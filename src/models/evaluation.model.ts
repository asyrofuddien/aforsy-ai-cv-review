import mongoose, { Document, Schema } from 'mongoose';
import { EvaluationResult, EvaluationStatus } from '../types/evaluation.types';

export interface IEvaluation extends Document {
  candidateName?: string;
  cvDocumentId: mongoose.Types.ObjectId;
  jobDescriptionId: mongoose.Types.ObjectId;
  status: EvaluationStatus;
  result?: EvaluationResult;
  error?: string;
  code_id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EvaluationSchema = new Schema(
  {
    candidateName: { type: String },
    cvDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    code_id: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    jobDescriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'JobDescription',
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      required: true,
    },
    result: {
      cvMatchRate: Number,
      cvFeedback: String,
      projectScore: Number,
      projectFeedback: String,
      overallSummary: String,
      recommendation: String,
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
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IEvaluation>('Evaluation', EvaluationSchema);
