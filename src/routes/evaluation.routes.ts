import { Router } from 'express';
import evaluationController from '../controllers/evaluation.controller';
import { validateEvaluation } from '../middlewares/validation.middleware';

const router = Router();

router.post('/', validateEvaluation, evaluationController.startEvaluation);
router.post('/cv-matcher', evaluationController.startCVMatcher);
router.get('/cv-matcher/:id/:code', evaluationController.CVMakerById);
router.get('/cv-matcher/:code', evaluationController.getAllCvMatcher);
router.get('/:id', evaluationController.getResult);

export default router;
