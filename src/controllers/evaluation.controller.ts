import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middlewares/error.middleware';
import queueService from '../services/queue.service';
import JobDescription from '../models/jobDescription.model';
import Evaluation from '../models/evaluation.model';
import { ERROR_MESSAGES } from '../utils/constants';
import logger from '../utils/logger';

export class EvaluationController {
  startEvaluation = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { cvDocumentId, jobDescriptionId, candidateName } = req.body;

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
    const job = await queueService.addEvaluationJob({
      cvDocumentId,
      jobDescriptionId: actualJobDescriptionId,
      candidateName,
    });

    logger.info(`Evaluation job created: ${job.id}`);

    res.status(202).json({
      id: job.id,
      status: 'queued',
    });
  });

  startCVMatcher = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { cvDocumentId } = req.body;

    if (!cvDocumentId) throw new AppError('cvDocumentId file is required', 400);

    // Add to queue
    const job = await queueService.addCVMatcher({
      cvDocumentId,
    });

    logger.info(`CvMatcher job created: ${job.id}`);

    res.status(202).json({
      id: job.id,
      status: 'queued',
    });
  });

  private async createDefaultJobDescription() {
    const defaultData = {
      slug: 'default',
      title: 'Senior Backend Engineer',
      company: 'Tech Company',
      description: 'We are looking for a Senior Backend Engineer with strong experience in Node.js and cloud technologies.',
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
  getQueueStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
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
  });

  getResult = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
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
  });
}

export default new EvaluationController();
