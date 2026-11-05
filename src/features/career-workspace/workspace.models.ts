import mongoose, { Schema } from 'mongoose';

const feedbackSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    evaluationId: { type: Schema.Types.ObjectId, required: true, unique: true },
    helpful: { type: Boolean, required: true },
    reason: { type: String, maxlength: 500 },
    appliedCriteria: [{ type: String, maxlength: 60 }],
  },
  { timestamps: true },
);

const caseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    evaluationId: { type: Schema.Types.ObjectId, index: true },
    paymentOrderId: { type: Schema.Types.ObjectId, index: true },
    subject: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved'],
      default: 'open',
      index: true,
    },
    adminNote: { type: String, maxlength: 2000 },
    resolvedAt: Date,
  },
  { timestamps: true },
);

const applicationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, maxlength: 120 },
    company: { type: String, required: true, maxlength: 120 },
    url: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ['saved', 'applied', 'interview', 'offer', 'rejected'],
      default: 'saved',
    },
    note: { type: String, maxlength: 2000 },
    draftId: { type: Schema.Types.ObjectId },
    evaluationId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);
applicationSchema.index({ userId: 1, updatedAt: -1 });

const revisionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    draftId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    evaluationId: { type: Schema.Types.ObjectId },
    appliedCriteria: [{ type: String, maxlength: 60 }],
  },
  { timestamps: true },
);
revisionSchema.index({ userId: 1, draftId: 1, createdAt: -1 });

export const ReviewFeedback = mongoose.model('ReviewFeedback', feedbackSchema);
export const SupportCase = mongoose.model('SupportCase', caseSchema);
export const JobApplication = mongoose.model('JobApplication', applicationSchema);
export const DraftRevision = mongoose.model('DraftRevision', revisionSchema);
