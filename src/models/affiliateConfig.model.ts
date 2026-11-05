import mongoose, { Schema } from 'mongoose';
const AffiliateConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'landly' },
    status: {
      type: String,
      enum: ['coming_soon', 'active'],
      default: 'coming_soon',
      required: true,
    },
    url: { type: String, maxlength: 2000 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, autoIndex: false, strict: 'throw' },
);
export default mongoose.models.AffiliateConfig ||
  mongoose.model('AffiliateConfig', AffiliateConfigSchema);
