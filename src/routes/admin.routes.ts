import { Router } from 'express';
import adminController from '../controllers/admin.controller';
import { requireAdmin } from '../middlewares/auth.middleware';
import { billingController } from '../features/billing/billing.controller';
import { updateAffiliateConfig } from '../controllers/affiliate.controller';

const router = Router();
router.use(requireAdmin);

router.get('/summary', adminController.summary);
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUserDetails);
router.get('/users/:id/activity', adminController.getUserActivity);
router.post('/users/:userId/processes/:type/:processId/retry', adminController.retryUserProcess);
router.patch('/users/:id/status', adminController.setUserStatus);
router.patch('/users/:id/role', adminController.setUserRole);
router.get('/templates', adminController.listTemplates);
router.post('/templates', adminController.createTemplate);
router.patch('/templates/:id', adminController.updateTemplate);
router.delete('/templates/:id', adminController.archiveTemplate);
router.get('/audit', adminController.listAudit);
router.post('/billing/users/:userId/goodwill', billingController.goodwill);
router.get('/billing/payments', billingController.adminPayments);
router.get('/billing/payments/:id', billingController.adminPaymentDetail);
router.get('/billing/summary', billingController.adminSummary);
router.get('/billing/refund-requests', billingController.adminRefundRequests);
router.post('/billing/payments/:orderId/refund-requests', billingController.refundRequest);
router.put('/affiliate/config', updateAffiliateConfig);

export default router;
