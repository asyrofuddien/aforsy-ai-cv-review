import { Router } from 'express';
import evaluationController from '../controllers/evaluation.controller';
import { validateEvaluation } from '../middlewares/validation.middleware';

const router = Router();

router.post('/', validateEvaluation, evaluationController.startEvaluation);
router.post('/cv-matcher', evaluationController.startCVMatcher);
router.get('/cv-matcher/:id', evaluationController.CVMakerById);
router.get('/:id', evaluationController.getResult);

export default router;
