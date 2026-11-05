import { Router } from 'express';
import { requireAdmin } from '../middlewares/auth.middleware';
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
router.post('/', requireAdmin, validateJobDescription, jobDescriptionController.create);
router.post('/upload', requireAdmin, uploadSingle, jobDescriptionController.uploadJobDescription);
router.put('/:id', requireAdmin, validateJobDescriptionUpdate, jobDescriptionController.update);
router.delete('/:id', requireAdmin, jobDescriptionController.delete);
router.patch('/:id/set-default', requireAdmin, jobDescriptionController.setDefault);

export default router;
