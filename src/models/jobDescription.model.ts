import mongoose, { Document, Schema } from 'mongoose';

export interface IJobDescription extends Document {
  slug: string; // untuk identifier seperti "default"
  title: string;
  company: string;
  description: string;
  requirements: {
    technical: string[];
    soft_skills: string[];
  };
  scoringWeights: {
    technicalSkillsMatch: number;
    experienceLevel: number;
    relevantAchievements: number;
    culturalFit: number;
    aiExperience: number;
  };
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JobDescriptionSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: { type: String, required: true },
    company: { type: String, required: true },
    description: { type: String, required: true },
    requirements: {
      technical: [String],
      soft_skills: [String],
    },
    scoringWeights: {
      technicalSkillsMatch: { type: Number, default: 0.3 },
      experienceLevel: { type: Number, default: 0.25 },
      relevantAchievements: { type: Number, default: 0.2 },
      culturalFit: { type: Number, default: 0.15 },
      aiExperience: { type: Number, default: 0.1 },
    },
    isDefault: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IJobDescription>(
  'JobDescription',
  JobDescriptionSchema
);
