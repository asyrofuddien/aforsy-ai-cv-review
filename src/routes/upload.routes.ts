import { Router } from 'express';
import uploadController from '../controllers/upload.controller';
import { uploadMultiple } from '../middlewares/upload.middleware';
import { validateUpload } from '../middlewares/validation.middleware';

const router = Router();

router.post(
  '/',
  uploadMultiple,
  validateUpload,
  uploadController.uploadDocuments
);

export default router;
