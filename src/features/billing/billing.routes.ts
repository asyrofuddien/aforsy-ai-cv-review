import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { billingController } from './billing.controller';

const router = Router();

router.get('/catalog', billingController.catalog);
router.get('/wallet', authenticate, billingController.wallet);
router.get('/ledger', authenticate, billingController.ledger);

export default router;
