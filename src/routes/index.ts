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

const router = Router();

router.use('/auth', authRoutes);
router.use('/', systemRoutes);
router.use('/', documentRoutes);
router.use('/billing', billingRoutes);

// All product and account data routes below this point require an active session.
router.use(authenticate);
router.get('/dashboard/summary', dashboardSummary);
router.use('/test', requireAdmin);
router.use('/admin', adminRoutes);

// Product routes use the authenticated user as the owner of all created data.
router.use('/upload', uploadRoutes);
router.use('/evaluate', evaluationRoutes);
router.use('/job-descriptions', jobDescriptionRoutes);
router.use('/cv-generator', CVGeneratorRoutes);

router.use('/test', reportingRoutes);

export default router;
