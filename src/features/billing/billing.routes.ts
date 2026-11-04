import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { billingController } from './billing.controller';

const router = Router();

router.get('/catalog', billingController.catalog);
router.post('/purchase-intents', authenticate, billingController.purchaseIntent);
router.get('/wallet', authenticate, billingController.wallet);
router.get('/ledger', authenticate, billingController.ledger);
router.get('/payments', authenticate, billingController.payments);
router.get('/payments/:id/receipt', authenticate, billingController.paymentReceipt);
router.get('/payments/:id', authenticate, billingController.paymentDetail);
router.post('/payments/claim', authenticate, billingController.claimPayment);

export default router;
