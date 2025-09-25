import { Router } from 'express';
import uploadRoutes from './upload.routes';
import evaluationRoutes from './evaluation.routes';
import resultRoutes from './result.routes';

import { Request, Response } from 'express';
import Document from '../models/document.model';
import Evaluation from '../models/evaluation.model';
import JobDescription from '../models/jobDescription.model';
import queueService from '../services/queue.service';

const router = Router();

// Mount routes
router.use('/upload', uploadRoutes);
router.use('/evaluate', evaluationRoutes);
router.use('/result', resultRoutes);

// Test route
router.get('/test', (req, res) => {
  const isDev = process.env.NODE_ENV === 'development';

  const endpoints = [
    '===== HEALTH & INFO =====',
    'GET  /health                           - Health check',
    'GET  /api                              - API overview',
    'GET  /api/test                         - This endpoint (all routes list)',
    '',
    '===== MAIN ENDPOINTS =====',
    'POST /api/upload                       - Upload CV and Project files',
    'POST /api/evaluate                     - Start evaluation process',
    'GET  /api/result/:id                   - Get evaluation result',
    'GET  /api/evaluate/queue-status        - Get queue statistics',
    '',
    '===== TESTING & MONITORING =====',
    'GET  /api/test/recent-uploads          - Get recent document uploads',
    'GET  /api/test/recent-evaluations      - Get recent evaluations',
    'GET  /api/test/job-descriptions        - Get available job descriptions',
    'GET  /api/test/stats                   - Get system statistics',
  ];

  if (isDev) {
    endpoints.push(
      '',
      '===== DEVELOPMENT ONLY =====',
      'DELETE /api/test/clear-test-data       - Clear all test data [DEV ONLY]'
    );
  }

  res.json({
    message: 'CV Evaluation API - All Endpoints',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    endpoints,
    notes: {
      upload: 'Accepts PDF, DOCX, and TXT files (max 10MB)',
      evaluate: 'Returns evaluation ID for async processing',
      result: 'Poll this endpoint until status is "completed"',
      authentication: 'No authentication required (add for production)',
      devOnly: isDev
        ? 'Development endpoints are enabled'
        : 'Development endpoints are disabled',
    },
  });
});

// Root API route
router.get('/', (req, res) => {
  res.json({
    name: 'CV Evaluation API',
    description: 'AI-powered CV and project evaluation service',
    documentation: '/api/test',
    health: '/health',
    quickstart: {
      step1: 'POST /api/upload - Upload CV and project files',
      step2: 'POST /api/evaluate - Start evaluation with document IDs',
      step3: 'GET /api/result/:id - Get evaluation result',
    },
  });
});

// Get recent uploads
router.get('/test/recent-uploads', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const documents = await Document.find()
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .select('originalName type size uploadedAt');

    res.json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get recent evaluations
router.get('/test/recent-evaluations', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const evaluations = await Evaluation.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('candidateName status createdAt updatedAt');

    res.json({
      success: true,
      count: evaluations.length,
      evaluations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get available job descriptions
router.get('/test/job-descriptions', async (req: Request, res: Response) => {
  try {
    const jobs = await JobDescription.find().select(
      'slug title company isDefault'
    );

    res.json({
      success: true,
      count: jobs.length,
      jobDescriptions: jobs,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Clear test data (development only)
router.delete('/test/clear-test-data', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is only available in development',
      });
    }

    // Clear evaluations
    const evalCount = await Evaluation.countDocuments();
    await Evaluation.deleteMany({});

    // Clear documents
    const docCount = await Document.countDocuments();
    await Document.deleteMany({});

    res.json({
      success: true,
      message: 'Test data cleared',
      deleted: {
        evaluations: evalCount,
        documents: docCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// System stats
router.get('/test/stats', async (req: Request, res: Response) => {
  try {
    const [documentCount, evaluationCount, queueStats] = await Promise.all([
      Document.countDocuments(),
      Evaluation.countDocuments(),
      queueService.getJobCounts(),
    ]);

    const evaluationStats = await Evaluation.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      stats: {
        documents: {
          total: documentCount,
        },
        evaluations: {
          total: evaluationCount,
          byStatus: evaluationStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
        },
        queue: queueStats,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
