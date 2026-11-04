import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  eventKey: { type: String, required: true, maxlength: 180 },
  type: { type: String, required: true, maxlength: 80 },
  title: { type: String, required: true, maxlength: 180 },
  body: { type: String, required: true, maxlength: 500 },
  entityId: { type: Schema.Types.ObjectId, required: true },
  readAt: Date,
}, { timestamps: true, autoIndex: false });
schema.index({ eventKey: 1 }, { unique: true, name: 'notification_event_unique' });
schema.index({ userId: 1, readAt: 1, createdAt: -1 }, { name: 'user_unread_created' });
export default mongoose.models.UserNotification || mongoose.model('UserNotification', schema, 'user_notifications');
