import { Router } from 'express';
import jobDescriptionController from '../controllers/jobDescription.controller';
import { uploadSingle } from '../middlewares/upload.middleware';
import {
  validateJobDescription,
  validateJobDescriptionUpdate,
} from '../middlewares/validation.middleware';

const router = Router();

// CRUD routes
router.get('/', jobDescriptionController.getAll);
router.get('/:id', jobDescriptionController.getOne);
router.get('/slug/:slug', jobDescriptionController.getBySlug);
router.post('/', validateJobDescription, jobDescriptionController.create);
router.post(
  '/upload',
  uploadSingle,
  jobDescriptionController.uploadJobDescription
);
router.put(
  '/:id',
  validateJobDescriptionUpdate,
  jobDescriptionController.update
);
router.delete('/:id', jobDescriptionController.delete);
router.patch('/:id/set-default', jobDescriptionController.setDefault);

export default router;
