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

export const validateUpload = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Validation is handled by multer
  next();
};
