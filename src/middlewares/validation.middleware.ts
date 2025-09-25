import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './error.middleware';

const evaluationSchema = Joi.object({
  cvDocumentId: Joi.string().required(),
  projectDocumentId: Joi.string().required(),
  jobDescriptionId: Joi.string().allow(null).optional(),
  candidateName: Joi.string().optional(),
});

export const validateEvaluation = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { error } = evaluationSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }
  next();
};
const jobDescriptionSchema = Joi.object({
  slug: Joi.string()
    .required()
    .lowercase()
    .trim()
    .pattern(/^[a-z0-9-]+$/)
    .message('Slug must contain only lowercase letters, numbers, and hyphens'),
  title: Joi.string().required().min(3).max(100),
  company: Joi.string().required().min(2).max(100),
  description: Joi.string().required().min(100),
  requirements: Joi.object({
    technical: Joi.array().items(Joi.string()).min(1),
    soft_skills: Joi.array().items(Joi.string()).min(1),
  }).required(),
  scoringWeights: Joi.object({
    technicalSkillsMatch: Joi.number().min(0).max(1),
    experienceLevel: Joi.number().min(0).max(1),
    relevantAchievements: Joi.number().min(0).max(1),
    culturalFit: Joi.number().min(0).max(1),
    aiExperience: Joi.number().min(0).max(1),
  }).optional(),
  isDefault: Joi.boolean().optional(),
});

const jobDescriptionUpdateSchema = jobDescriptionSchema.fork(
  ['slug', 'title', 'company', 'description', 'requirements'],
  (schema) => schema.optional()
);

export const validateJobDescription = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { error } = jobDescriptionSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }
  next();
};

export const validateJobDescriptionUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { error } = jobDescriptionUpdateSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }
  next();
};

export const validateUpload = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Validation is handled by multer
  next();
};
