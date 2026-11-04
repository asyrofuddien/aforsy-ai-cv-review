import { Router } from 'express';
import { retryJobMatching } from '../features/review/matching-retry.controller';
import evaluationController from '../controllers/evaluation.controller';
import { validateEvaluation } from '../middlewares/validation.middleware';

const router = Router();

router.post('/', validateEvaluation, evaluationController.startEvaluation);
router.post('/cv-matcher', evaluationController.startCVMatcher);
router.get('/cv-matcher', evaluationController.getAllCvMatcher);
router.get('/cv-matcher/:id', evaluationController.CVMakerById);
router.get('/queue-status', evaluationController.getQueueStatus);
router.get('/history', evaluationController.getHistory);
router.post('/:id/retry-matching', retryJobMatching);
router.get('/:id', evaluationController.getResult);

export default router;
