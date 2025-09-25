import { Router } from 'express';
import resultController from '../controllers/result.controller';

const router = Router();

router.get('/:id', resultController.getResult);

export default router;
