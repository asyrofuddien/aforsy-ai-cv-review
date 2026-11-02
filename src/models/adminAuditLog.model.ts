import mongoose, { Schema } from 'mongoose';

const AdminAuditLogSchema = new Schema({
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, maxlength: 80, index: true },
  targetType: { type: String, enum: ['user', 'ats_template', 'evaluation', 'cv_matcher'], required: true, index: true },
  targetId: { type: String, required: true, maxlength: 100, index: true },
  details: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

AdminAuditLogSchema.index({ createdAt: -1 });

export default mongoose.model('AdminAuditLog', AdminAuditLogSchema);
