import Document from '../models/document.model';
import Evaluation from '../models/evaluation.model';
import JobDescription from '../models/jobDescription.model';
import Code from '../models/code.model';
import CvMatcher from '../models/cvMatcher.model';
import AtsPDF from '../models/atsPDF.model';
import Template from '../models/Template.model';
import queueService from './queue.service';

export async function loadSystemStats() {
  const [codeStats, documentStats, evaluationStats, cvMatcherStats, atsPdfStats, templateStats, jobDescStats, queueStats] = await Promise.all([
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
  return { codeStats, documentStats, evaluationStats, cvMatcherStats, atsPdfStats, templateStats, jobDescStats, queueStats };
}
