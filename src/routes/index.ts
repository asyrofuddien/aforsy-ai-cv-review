import { Router } from 'express';
import uploadRoutes from './upload.routes';
import evaluationRoutes from './evaluation.routes';

import { Request, Response } from 'express';
import Document from '../models/document.model';
import Evaluation from '../models/evaluation.model';
import JobDescription from '../models/jobDescription.model';
import Code from '../models/code.model';
import CvMatcher from '../models/cvMatcher.model';
import AtsPDF from '../models/atsPDF.model';
import Template from '../models/Template.model';
import queueService from '../services/queue.service';
import jobDescriptionRoutes from './jobDescription.routes';
import CodeGeneratorController from '../controllers/code.controller';
import CVGeneratorRoutes from '../routes/cvGenerator.routes';

const router = Router();

// Mount routes
router.use('/upload', uploadRoutes);
router.use('/evaluate', evaluationRoutes);
router.use('/job-descriptions', jobDescriptionRoutes);
router.use('/cv-generator', CVGeneratorRoutes);

router.get('/get-code', CodeGeneratorController.GenerateCode);
router.get('/redeem-code/:id', CodeGeneratorController.RedeemCode);

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
    message: 'CV Evaluation API - All Endpoints',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    endpoints,
    notes: {
      upload: 'Accepts PDF, DOCX, and TXT files (max 10MB)',
      evaluate: 'Returns evaluation ID for async processing',
      result: 'Poll this endpoint until status is "completed"',
      authentication: 'No authentication required (add for production)',
      devOnly: isDev ? 'Development endpoints are enabled' : 'Development endpoints are disabled',
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
    const documents = await Document.find().sort({ uploadedAt: -1 }).limit(limit).select('originalName type size uploadedAt');

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
    const evaluations = await Evaluation.find().sort({ createdAt: -1 }).limit(limit).select('candidateName status createdAt updatedAt');

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
    const jobs = await JobDescription.find().select('slug title company isDefault');

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
    // Get comprehensive stats from all models
    const [
      codeStats,
      documentStats, 
      evaluationStats, 
      cvMatcherStats,
      atsPdfStats,
      templateStats,
      jobDescStats, 
      queueStats
    ] = await Promise.all([
      // Code statistics
      Promise.all([
        Code.countDocuments(),
        Code.aggregate([
          {
            $project: {
              codeLength: { $strLenCP: '$code' },
              createdAt: 1
            }
          },
          {
            $group: {
              _id: null,
              avgCodeLength: { $avg: '$codeLength' },
              oldestCode: { $min: '$createdAt' },
              newestCode: { $max: '$createdAt' }
            }
          }
        ])
      ]),
      
      // Document statistics
      Promise.all([
        Document.countDocuments(),
        Document.aggregate([
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              totalSize: { $sum: '$size' },
              avgSize: { $avg: '$size' },
            },
          },
        ]),
        Document.aggregate([
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$uploadedAt' } },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id': -1 } },
          { $limit: 6 }
        ])
      ]),
      
      // Evaluation statistics
      Promise.all([
        Evaluation.countDocuments(),
        Evaluation.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
        ]),
        Evaluation.aggregate([
          {
            $match: { status: 'completed', 'result.cvMatchRate': { $exists: true } },
          },
          {
            $group: {
              _id: null,
              avgCvMatchRate: { $avg: '$result.cvMatchRate' },
              avgProjectScore: { $avg: '$result.projectScore' },
              maxCvMatchRate: { $max: '$result.cvMatchRate' },
              minCvMatchRate: { $min: '$result.cvMatchRate' },
            },
          },
        ]),
        Evaluation.aggregate([
          {
            $match: { status: 'completed' }
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
              avgScore: { $avg: '$result.cvMatchRate' }
            }
          },
          { $sort: { '_id': -1 } },
          { $limit: 7 }
        ])
      ]),
      
      // CV Matcher statistics
      Promise.all([
        CvMatcher.countDocuments(),
        CvMatcher.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]),
        CvMatcher.aggregate([
          {
            $match: { status: 'completed', 'result.user_profile.seniority': { $exists: true } }
          },
          {
            $group: {
              _id: '$result.user_profile.seniority',
              count: { $sum: 1 }
            }
          }
        ]),
        CvMatcher.aggregate([
          {
            $match: { status: 'completed', 'result.jobs': { $exists: true } }
          },
          {
            $unwind: '$result.jobs'
          },
          {
            $group: {
              _id: '$result.jobs.grade',
              count: { $sum: 1 },
              avgScore: { $avg: '$result.jobs.score' }
            }
          }
        ])
      ]),
      
      // ATS PDF statistics
      Promise.all([
        AtsPDF.countDocuments(),
        AtsPDF.aggregate([
          {
            $project: {
              htmlLength: { $strLenCP: '$html_text' },
              createdAt: 1
            }
          },
          {
            $group: {
              _id: null,
              avgHtmlLength: { $avg: '$htmlLength' },
              totalReports: { $sum: 1 }
            }
          }
        ])
      ]),
      
      // Template statistics
      Promise.all([
        Template.countDocuments(),
        Template.aggregate([
          {
            $project: {
              name: 1,
              contentLength: { $strLenCP: '$content' },
              createdAt: 1
            }
          },
          {
            $group: {
              _id: null,
              avgContentLength: { $avg: '$contentLength' },
              templates: { $push: { name: '$name', length: '$contentLength' } }
            }
          }
        ])
      ]),
      
      // Job Description statistics
      Promise.all([
        JobDescription.countDocuments(),
        JobDescription.countDocuments({ isDefault: true }),
        JobDescription.aggregate([
          {
            $group: {
              _id: '$company',
              count: { $sum: 1 },
              positions: { $push: '$title' }
            }
          }
        ])
      ]),
      
      // Queue statistics
      queueService.getJobCounts(),
    ]);

    // Process code stats
    const [codeCount, codeDetails] = codeStats;
    const codeInfo = codeDetails[0] || { avgCodeLength: 0, oldestCode: null, newestCode: null };

    // Process document stats
    const [docCount, docsByType, docsByMonth] = documentStats;
    const docTypeBreakdown = docsByType.reduce((acc: any, stat: any) => {
      acc[stat._id] = {
        count: stat.count,
        totalSize: (stat.totalSize / 1024 / 1024).toFixed(2) + ' MB',
        avgSize: (stat.avgSize / 1024).toFixed(2) + ' KB',
      };
      return acc;
    }, {});

    // Process evaluation stats
    const [evalCount, evalByStatus, evalScores, evalTrends] = evaluationStats;
    const evalStatusBreakdown = evalByStatus.reduce((acc: any, stat: any) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});
    const completionRate = evalCount > 0 ? ((evalStatusBreakdown.completed || 0) / evalCount * 100).toFixed(2) : '0.00';
    const avgScores = evalScores[0] || { avgCvMatchRate: 0, avgProjectScore: 0, maxCvMatchRate: 0, minCvMatchRate: 0 };

    // Process CV Matcher stats
    const [cvMatcherCount, cvMatcherByStatus, cvMatcherBySeniority, cvMatcherByGrade] = cvMatcherStats;
    const cvMatcherStatusBreakdown = cvMatcherByStatus.reduce((acc: any, stat: any) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    // Process ATS PDF stats
    const [atsPdfCount, atsPdfDetails] = atsPdfStats;
    const atsPdfInfo = atsPdfDetails[0] || { avgHtmlLength: 0, totalReports: 0 };

    // Process template stats
    const [templateCount, templateDetails] = templateStats;
    const templateInfo = templateDetails[0] || { avgContentLength: 0, templates: [] };

    // Process job description stats
    const [jobCount, defaultJobCount, jobsByCompany] = jobDescStats;

    // Calculate system health metrics
    const totalProcessedItems = (evalStatusBreakdown.completed || 0) + (cvMatcherStatusBreakdown.completed || 0);
    const totalFailedItems = (evalStatusBreakdown.failed || 0) + (cvMatcherStatusBreakdown.failed || 0);
    const systemReliability = totalProcessedItems + totalFailedItems > 0 
      ? ((totalProcessedItems / (totalProcessedItems + totalFailedItems)) * 100).toFixed(2)
      : '100.00';

    res.json({
      success: true,
      timestamp: new Date(),
      productOverview: {
        name: 'AFORSY AI CV Review System',
        version: '1.0.0',
        totalCodes: codeCount,
        totalDocuments: docCount,
        totalEvaluations: evalCount,
        totalCvMatches: cvMatcherCount,
        totalAtsReports: atsPdfCount,
        systemReliability: `${systemReliability}%`,
        evaluationCompletionRate: `${completionRate}%`,
      },
      
      coreMetrics: {
        averageCvMatchRate: `${(avgScores.avgCvMatchRate || 0).toFixed(2)}%`,
        averageProjectScore: (avgScores.avgProjectScore || 0).toFixed(2),
        highestCvMatchRate: `${(avgScores.maxCvMatchRate || 0).toFixed(2)}%`,
        lowestCvMatchRate: `${(avgScores.minCvMatchRate || 0).toFixed(2)}%`,
        totalJobDescriptions: jobCount,
        activeTemplates: templateCount,
      },

      detailedStats: {
        codes: {
          total: codeCount,
          averageLength: Math.round(codeInfo.avgCodeLength || 0),
          format: 'AFORSY-XXXXXXXX',
          oldestGenerated: codeInfo.oldestCode,
          newestGenerated: codeInfo.newestCode,
        },
        
        documents: {
          total: docCount,
          byType: docTypeBreakdown,
          monthlyUploads: docsByMonth.slice(0, 6),
        },
        
        evaluations: {
          total: evalCount,
          byStatus: evalStatusBreakdown,
          completionRate: `${completionRate}%`,
          averageScores: {
            cvMatchRate: `${(avgScores.avgCvMatchRate || 0).toFixed(2)}%`,
            projectScore: (avgScores.avgProjectScore || 0).toFixed(2),
          },
          performanceRange: {
            highest: `${(avgScores.maxCvMatchRate || 0).toFixed(2)}%`,
            lowest: `${(avgScores.minCvMatchRate || 0).toFixed(2)}%`,
          },
          recentTrends: evalTrends.slice(0, 7),
        },
        
        cvMatcher: {
          total: cvMatcherCount,
          byStatus: cvMatcherStatusBreakdown,
          candidateProfiles: {
            bySeniority: cvMatcherBySeniority,
            byJobGrade: cvMatcherByGrade,
          },
          completionRate: cvMatcherCount > 0 
            ? `${(((cvMatcherStatusBreakdown.completed || 0) / cvMatcherCount) * 100).toFixed(2)}%`
            : '0.00%',
        },
        
        atsReports: {
          total: atsPdfCount,
          averageHtmlLength: Math.round(atsPdfInfo.avgHtmlLength || 0),
          formats: ['HTML', 'PDF'],
          generatedReports: atsPdfInfo.totalReports || 0,
        },
        
        templates: {
          total: templateCount,
          averageContentLength: Math.round(templateInfo.avgContentLength || 0),
          availableTemplates: templateInfo.templates.map((t: any) => ({
            name: t.name,
            size: `${Math.round(t.length / 1024)} KB`
          })),
        },
        
        jobDescriptions: {
          total: jobCount,
          default: defaultJobCount,
          custom: jobCount - defaultJobCount,
          byCompany: jobsByCompany,
        },
        
        systemQueue: queueStats,
      },

      businessInsights: {
        productUtilization: {
          documentProcessingRate: docCount > 0 ? `${((evalCount / docCount) * 100).toFixed(2)}%` : '0%',
          cvMatchingAdoption: docCount > 0 ? `${((cvMatcherCount / docCount) * 100).toFixed(2)}%` : '0%',
          atsReportGeneration: docCount > 0 ? `${((atsPdfCount / docCount) * 100).toFixed(2)}%` : '0%',
        },
        
        qualityMetrics: {
          systemReliability: `${systemReliability}%`,
          averageProcessingSuccess: `${completionRate}%`,
          dataIntegrity: codeCount === 1223 ? 'Excellent' : 'Needs Review',
        },
        
        capacityMetrics: {
          totalCodesGenerated: codeCount,
          codesUtilized: evalCount + cvMatcherCount + atsPdfCount,
          remainingCapacity: Math.max(0, codeCount - (evalCount + cvMatcherCount + atsPdfCount)),
          utilizationRate: codeCount > 0 
            ? `${(((evalCount + cvMatcherCount + atsPdfCount) / codeCount) * 100).toFixed(2)}%`
            : '0%',
        }
      }
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date(),
    });
  }
});

export default router;
