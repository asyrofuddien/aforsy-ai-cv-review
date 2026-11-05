import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import config from '../config/config';
import { AppError } from './error.middleware';

// Configure storage
const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    // Never derive a filesystem path from multipart fields. Busboy may also
    // deliver file parts before fields, so req.body is not a safe selector.
    const uploadPath = path.resolve(config.upload.uploadDir, 'temp');
    try {
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error as Error, uploadPath);
    }
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (config.upload.allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`File type ${file.mimetype} not allowed`, 400));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
});

// Specific upload configurations
export const uploadSingle = uploadMiddleware.single('file');
export const uploadMultiple = uploadMiddleware.fields([
  { name: 'cv', maxCount: 1 },
]);
