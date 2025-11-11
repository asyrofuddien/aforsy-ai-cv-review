// models/cvMatcher.model.ts

import mongoose, { Document, Schema } from 'mongoose';
import { EvaluationResult, EvaluationStatus } from '../types/evaluation.types';
import { required } from 'joi';

export interface IEvaluation extends Document {
  candidateName?: string;
  cvDocumentId: mongoose.Types.ObjectId;
  jobDescriptionId: mongoose.Types.ObjectId;
  status: EvaluationStatus;
  result?: EvaluationResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserProfileSchema = new Schema(
  {
    name: { type: String, required: true },
    seniority: { type: String, required: true },
    primary_skills: [{ type: String }],
  },
  { _id: false }
);

const JobSuggestionSchema = new Schema(
  {
    title: { type: String, required: true },
    company: { type: String, required: true },
    link: { type: String, required: true },
    skill_match: { type: Number, required: true },
    experience_match: { type: Number, required: true },
    responsibility_match: { type: Number, required: true },
    job_description: { type: String, required: true },
    score: { type: Number, required: true },
    grade: { type: String, required: true },
    explanation: { type: String, required: true },
  },
  { _id: false }
);

const EvaluationSummarySchema = new Schema(
  {
    strengths: [{ type: String }],
    improvements: [{ type: String }],
    next_steps: [{ type: String }],
  },
  { _id: false }
);

const EvaluationResultSchema = new Schema(
  {
    user_profile: { type: UserProfileSchema, required: true },
    suggested_roles: [{ type: String }],
    jobs: [JobSuggestionSchema],
    summary: { type: EvaluationSummarySchema, required: true },
  },
  { _id: false }
);

const CvMatcherSchema = new Schema(
  {
    cvDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      required: true,
    },
    result: EvaluationResultSchema,
    error: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IEvaluation>('CvMatcher', CvMatcherSchema);
