import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middlewares/error.middleware';
import queueService from '../services/queue.service';
import JobDescription from '../models/jobDescription.model';
import Evaluation from '../models/evaluation.model';
import { ERROR_MESSAGES } from '../utils/constants';
import logger from '../utils/logger';
import cvMatcherModel from '../models/cvMatcher.model';
import Document from '../models/document.model';

export class EvaluationController {
  startEvaluation = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { cvDocumentId, jobDescriptionId, candidateName } = req.body;
      const jobDescriptionText = req.body.jobDescriptionText?.trim() || undefined;
      if (jobDescriptionText && jobDescriptionId) throw new AppError('Use either pasted job description or a saved job, not both', 400);
      if (!cvDocumentId) throw new AppError('cvDocumentId is required', 400);
      const cvDocument = await Document.findOne({ _id: cvDocumentId, userId: req.authUser!.userId });
      if (!cvDocument) throw new AppError('CV document not found', 404);
      if (jobDescriptionId && !(await JobDescription.exists({ _id: jobDescriptionId }))) {
        throw new AppError('Job description not found', 404);
      }

      // Add to queue
      const job = await queueService.addEvaluationJob(
        {
          cvDocumentId,
          jobDescriptionId: jobDescriptionId || undefined,
          candidateName,
          jobDescriptionText,
        },
        req.authUser!.userId,
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
      const { cvDocumentId } = req.body;
      if (!cvDocumentId) throw new AppError('cvDocumentId is required', 400);
      const cvDocument = await Document.findOne({ _id: cvDocumentId, userId: req.authUser!.userId });
      if (!cvDocument) throw new AppError('CV document not found', 404);
      // Add to queue
      const job = await queueService.addCVMatcher(
        {
          cvDocumentId,
        },
        req.authUser!.userId,
      );

      logger.info(`CvMatcher job created: ${job.id}`);

      res.status(202).json({
        id: job.id,
        status: 'queued',
      });
    },
  );

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

      const evaluation = await Evaluation.findOne({ _id: id, userId: req.authUser!.userId });

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
          candidateName: evaluation.candidateName,
          status: evaluation.status,
          result: {
            cv_match_rate: evaluation.result.cvMatchRate,
            cv_feedback: evaluation.result.cvFeedback,
            project_score: evaluation.result.projectScore,
            project_feedback: evaluation.result.projectFeedback,
            overall_summary: evaluation.result.overallSummary,
            recommendation: evaluation.result.recommendation,
            mode: evaluation.result.mode || evaluation.evaluationMode,
            job_description: evaluation.result.jobDescription,
            missing_information: evaluation.result.missingInformation || [],
            detailed_scores: evaluation.result.detailedScores,
            criteria: evaluation.result.criteria || [],
            suggested_roles: evaluation.result.suggestedRoles || [],
            job_matches: evaluation.result.jobMatches || [],
          },
        });
      } else {
        res.status(200).json({
          id: evaluation.id,
          status: evaluation.status,
          error: evaluation.status === 'failed' ? 'Review could not be completed. Please try again with a readable CV.' : undefined,
        });
      }
    },
  );
  CVMakerById = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      const cvMatcher = await cvMatcherModel
        .findOne({
          _id: id,
          userId: req.authUser!.userId,
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
      const cvMatcher = await cvMatcherModel
        .find({ userId: req.authUser!.userId })
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
