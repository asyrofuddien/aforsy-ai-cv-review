import { Router } from 'express';
import generateCv from '../controllers/cv-generator.controller';
import { validateEvaluation } from '../middlewares/validation.middleware';

const router = Router();

router.post('/', generateCv.GenerateCv);
router.post('/new', generateCv.GenerateCvNew);
router.post('/get-all', generateCv.FindAllCv);

export default router;
