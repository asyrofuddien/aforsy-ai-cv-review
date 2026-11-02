import { Router } from 'express';
import config from '../config/config';

const router = Router();

// Public health endpoint used by the reverse proxy and deployment checks.
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Test route
router.get('/test', (req, res) => {
  const isDev = config.nodeEnv === 'development';

  const endpoints = [
    '===== HEALTH & INFO =====',
    'GET  /health                           - Health check',
    'GET  /api                              - API overview',
    'GET  /api/test                         - This endpoint (all routes list)',
    '',
    '===== MAIN ENDPOINTS =====',
    'POST /api/upload                       - Upload CV and Project files',
    'POST /api/evaluate                     - Start evaluation process',
    'GET  /api/evaluate/:id                   - Get evaluation result',
    '',
    '===== TESTING & MONITORING =====',
    'GET  /api/test/recent-uploads          - Get recent document uploads',
    'GET  /api/test/recent-evaluations      - Get recent evaluations',
    'GET  /api/test/job-descriptions        - Get available job descriptions',
    'GET  /api/test/stats                   - Get comprehensive system statistics and product metrics',
  ];

  if (isDev) {
    endpoints.push('', '===== DEVELOPMENT ONLY =====', 'DELETE /api/test/clear-test-data       - Clear all test data [DEV ONLY]');
  }

  res.json({
    message: 'Landly API - All Endpoints',
    environment: config.nodeEnv,
    version: '1.0.0',
    endpoints,
    notes: {
      upload: 'Accepts PDF, DOCX, and TXT files (max 10MB)',
      evaluate: 'Returns evaluation ID for async processing',
      result: 'Poll this endpoint until status is "completed"',
      authentication: 'Account required for product routes',
      devOnly: isDev ? 'Development endpoints are enabled' : 'Development endpoints are disabled',
    },
  });
});

// Root API route
router.get('/', (req, res) => {
  res.json({
    name: 'Landly API',
    description: 'AI-powered CV review and career tools',
    documentation: '/api/test',
    health: '/health',
    quickstart: {
      step1: 'POST /api/upload - Upload CV and project files',
      step2: 'POST /api/evaluate - Start evaluation with document IDs',
      step3: 'GET /api/result/:id - Get evaluation result',
    },
  });
});

export default router;
