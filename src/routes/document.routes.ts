import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import documentController from '../controllers/document.controller';

const router = Router();
router.get('/pdf/:filename', authenticate, documentController.downloadPdf);
export default router;
