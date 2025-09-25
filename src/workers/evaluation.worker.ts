import { Job } from 'bullmq';
import queueService from '../services/queue.service';
import Evaluation from '../models/evaluation.model';
import logger from '../utils/logger';

const processEvaluationJob = async (job: Job) => {
  try {
    logger.info(
      `🚀 Worker: Starting job ${job.id} for evaluation ${job.data.evaluationId}`
    );

    const { evaluationId } = job.data;

    // Update status to processing
    await Evaluation.findByIdAndUpdate(evaluationId, {
      status: 'processing',
    });

    // Update progress
    await job.updateProgress(10);
    logger.info(`📊 Worker: Job ${job.id} - Status updated to processing`);

    // Simulate processing time (replace with real evaluation later)
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await job.updateProgress(20 + i * 20);
      logger.info(`📊 Worker: Job ${job.id} - Progress: ${20 + i * 20}%`);
    }

    // Mock result
    const mockResult = {
      cvMatchRate: 0.82,
      cvFeedback:
        'Strong in backend and cloud, limited AI integration experience.',
      projectScore: 7.5,
      projectFeedback:
        'Meets prompt chaining requirements, lacks error handling robustness.',
      overallSummary:
        'Good candidate fit, would benefit from deeper RAG knowledge.',
      detailedScores: {
        technicalSkillsMatch: 4,
        experienceLevel: 4,
        relevantAchievements: 3,
        culturalFit: 4,
        correctness: 4,
        codeQuality: 3,
        resilience: 3,
        documentation: 4,
        creativity: 3,
      },
    };

    // Update evaluation with result
    await Evaluation.findByIdAndUpdate(evaluationId, {
      status: 'completed',
      result: mockResult,
    });

    logger.info(`✅ Worker: Job ${job.id} completed successfully`);
    return mockResult;
  } catch (error) {
    let message = 'Unknown error';
    if (error instanceof Error) {
      message = error.message;
    }

    await Evaluation.findByIdAndUpdate(job.data.evaluationId, {
      status: 'failed',
      error: message,
    });

    throw error;
  }
};

export const startWorker = (): void => {
  try {
    queueService.initializeWorker(processEvaluationJob);
    logger.info('🎯 Worker: Evaluation worker started successfully');
  } catch (error) {
    logger.error('❌ Worker: Failed to start worker:', error);
    throw error;
  }
};
