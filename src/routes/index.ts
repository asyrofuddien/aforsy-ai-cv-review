import { Router } from 'express';
import uploadRoutes from './upload.routes';
import evaluationRoutes from './evaluation.routes';

import jobDescriptionRoutes from './jobDescription.routes';
import CVGeneratorRoutes from '../routes/cvGenerator.routes';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';
import { dashboardSummary } from '../controllers/dashboard.controller';
import reportingRoutes from './reporting.routes';
import systemRoutes from './system.routes';
import documentRoutes from './document.routes';
import billingRoutes from '../features/billing/billing.routes';
import aiOperationRoutes from '../features/ai-operations/operation.routes';
import rateLimit from 'express-rate-limit';
import { receiveLynkWebhook } from '../features/billing/webhooks/webhook.receiver';
import { getAffiliateConfig } from '../controllers/affiliate.controller';
import workspaceRoutes from '../features/career-workspace/workspace.routes';

const router = Router();

router.use('/auth', authRoutes);
router.post(
  '/webhooks/lynk/receive',
  rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }),
  receiveLynkWebhook,
);
router.get('/affiliate/config', getAffiliateConfig);
router.use('/', systemRoutes);
router.use('/', documentRoutes);
router.use('/billing', billingRoutes);

// All product and account data routes below this point require an active session.
router.use(authenticate);
router.get('/dashboard/summary', dashboardSummary);
router.use('/test', requireAdmin);
router.use('/admin', adminRoutes);

// Product routes use the authenticated user as the owner of all created data.
router.use('/ai/operations', aiOperationRoutes);
router.use('/workspace', workspaceRoutes);
router.use('/upload', uploadRoutes);
router.use('/evaluate', evaluationRoutes);
router.use('/job-descriptions', jobDescriptionRoutes);
router.use('/cv-generator', CVGeneratorRoutes);

router.use('/test', reportingRoutes);

export default router;
