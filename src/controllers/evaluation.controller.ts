import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middlewares/error.middleware';
import queueService from '../services/queue.service';
import JobDescription from '../models/jobDescription.model';
import Evaluation from '../models/evaluation.model';
import { ERROR_MESSAGES } from '../utils/constants';
import logger from '../utils/logger';
import cvMatcherModel from '../models/cvMatcher.model';
import codeModel from '../models/code.model';

export class EvaluationController {
  startEvaluation = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { cvDocumentId, jobDescriptionId, candidateName, code } = req.body;
      let actualJobDescriptionId = jobDescriptionId;

      // If no jobDescriptionId provided, use default
      if (!jobDescriptionId) {
        const defaultJob = await JobDescription.findOne({ isDefault: true });
        if (!defaultJob) {
          // Create default if not exists
          const defaultJobDesc = await this.createDefaultJobDescription();
          actualJobDescriptionId = defaultJobDesc._id;
        } else {
          actualJobDescriptionId = defaultJob._id;
        }
      }

      // Add to queue
      const job = await queueService.addEvaluationJob(
        {
          cvDocumentId,
          jobDescriptionId: actualJobDescriptionId,
          candidateName,
        },
        code,
      );

      logger.info(`Evaluation job created: ${job.id}`);

      res.status(202).json({
        id: job.id,
        status: 'queued',
      });
    },
  );

  startCVMatcher = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { cvDocumentId, code } = req.body;

      if (!cvDocumentId || !code)
        throw new AppError('cvDocumentId and code files are required', 400);

      const codeData = await codeModel.findOne({ code });
      const codeId = codeData?._id;
      // Add to queue
      const job = await queueService.addCVMatcher(
        {
          cvDocumentId,
        },
        codeId,
      );

      logger.info(`CvMatcher job created: ${job.id}`);

      res.status(202).json({
        id: job.id,
        status: 'queued',
      });
    },
  );

  private async createDefaultJobDescription() {
    const defaultData = {
      slug: 'default',
      title: 'Senior Backend Engineer',
      company: 'Tech Company',
      description:
        'We are looking for a Senior Backend Engineer with strong experience in Node.js and cloud technologies.',
      requirements: {
        technical: [
          '5+ years of backend development experience',
          'Strong proficiency in Node.js and TypeScript',
          'Experience with databases (MongoDB, PostgreSQL)',
          'Knowledge of cloud platforms (AWS, GCP)',
          'Experience with microservices architecture',
          'Understanding of AI/ML concepts is a plus',
        ],
        soft_skills: [
          'Strong communication skills',
          'Team leadership experience',
          'Problem-solving mindset',
          'Continuous learning attitude',
        ],
      },
      isDefault: true,
    };

    const jobDesc = new JobDescription(defaultData);
    await jobDesc.save();
    logger.info('Default job description created');
    return jobDesc;
  }

  // Optional: Add method to get queue status
  getQueueStatus = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const counts = await queueService.getJobCounts();

      res.status(200).json({
        success: true,
        data: {
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
          paused: counts.paused || 0,
        },
      });
    },
  );

  getResult = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      const evaluation = await Evaluation.findById(id);

      if (!evaluation) {
        return res.status(404).json({
          success: false,
          message: ERROR_MESSAGES.EVALUATION_NOT_FOUND,
        });
      }

      // Format response based on status
      if (evaluation.status === 'completed' && evaluation.result) {
        res.status(200).json({
          id: evaluation.id,
          status: evaluation.status,
          result: {
            cv_match_rate: evaluation.result.cvMatchRate,
            cv_feedback: evaluation.result.cvFeedback,
            project_score: evaluation.result.projectScore,
            project_feedback: evaluation.result.projectFeedback,
            overall_summary: evaluation.result.overallSummary,
            recommendation: evaluation.result.recommendation,
          },
        });
      } else {
        res.status(200).json({
          id: evaluation.id,
          status: evaluation.status,
        });
      }
    },
  );
  CVMakerById = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id, code } = req.params;

      if (!code) {
        throw new Error('code required!');
      }

      const codeData = await codeModel.findOne({ code });
      const codeId = codeData?._id;

      const cvMatcher = await cvMatcherModel
        .findOne({
          _id: id,
          code_id: codeId,
        })
        .populate({
          path: 'cvDocumentId',
          select: '-content -__v',
        })
        .select('-__v')
        .lean();

      if (!cvMatcher) {
        return res.status(404).json({
          success: false,
          message: ERROR_MESSAGES.EVALUATION_NOT_FOUND,
        });
      }

      // Format response based on status
      if (cvMatcher.status === 'completed' && cvMatcher.result) {
        res.status(200).json({
          success: true,
          message: 'Retrived',
          data: {
            ...cvMatcher,
          },
        });
      } else {
        res.status(200).json({
          id: cvMatcher.id,
          status: cvMatcher.status,
        });
      }
    },
  );
  getAllCvMatcher = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { code } = req.params;
      const codeData = await codeModel.findOne({ code });
      const codeId = codeData?._id;

      if (!codeId) {
        return res.status(200).json({
          success: true,
          message: 'Retrieved',
          data: [],
        });
      }
      const cvMatcher = await cvMatcherModel
        .find({ code_id: codeId })
        .select('status result.user_profile.name createdAt updatedAt')
        .lean();

      const data = cvMatcher.map((item: any) => ({
        _id: item._id,
        name: item.result?.user_profile?.name || null,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

      res.status(200).json({
        success: true,
        message: 'Retrieved',
        data,
      });
    },
  );
}

export default new EvaluationController();
