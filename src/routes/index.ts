import { Router } from 'express';
import uploadRoutes from './upload.routes';
import evaluationRoutes from './evaluation.routes';
import resultRoutes from './result.routes';

const router = Router();

// Mount routes
router.use('/upload', uploadRoutes);
router.use('/evaluate', evaluationRoutes);
router.use('/result', resultRoutes);

// Test route
router.get('/test', (req, res) => {
  res.json({
    message: 'API is working',
    endpoints: [
      'POST /api/upload',
      'POST /api/evaluate',
      'GET /api/result/:id',
    ],
  });
});

export default router;
