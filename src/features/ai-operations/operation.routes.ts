import { Router } from 'express';
import { getOperation, getOperationResult, listOperations } from './operation.controller';

const router = Router();
router.get('/', listOperations);
router.get('/:id/result', getOperationResult);
router.get('/:id', getOperation);
export default router;
