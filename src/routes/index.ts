import { Router } from 'express';
import logger from '../utils/logger';

const router = Router();

// Temporary route to test
router.get('/test', (req, res) => {
  logger.info('Test route accessed');
  res.json({
    message: 'API is working',
    timestamp: new Date().toISOString(),
  });
});

export default router;
