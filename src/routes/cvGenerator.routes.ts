import { Router } from 'express';
import generateCv from '../controllers/cv-generator.controller';
import { validateEvaluation } from '../middlewares/validation.middleware';

const router = Router();

router.get('/draft', generateCv.GetDraft);
router.put('/draft', generateCv.SaveDraft);
router.delete('/draft', generateCv.DeleteDraft);
router.post('/', generateCv.GenerateCv);
router.post('/new', generateCv.GenerateCvNew);
router.get('/get-all', generateCv.FindAllCv);
router.get('/:id/html', generateCv.GetGeneratedHtml);

export default router;
