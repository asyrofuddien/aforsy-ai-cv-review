import { Router } from 'express';
import evaluationController from '../controllers/evaluation.controller';
import { validateEvaluation } from '../middlewares/validation.middleware';

const router = Router();

router.post('/', validateEvaluation, evaluationController.startEvaluation);

export default router;
