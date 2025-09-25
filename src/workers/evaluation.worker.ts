import { Job } from 'bullmq';
import queueService from '../services/queue.service';
import evaluationService from '../services/evaluation/evaluation.service';
import logger from '../utils/logger';

const processEvaluationJob = async (job: Job) => {
  try {
    logger.info(
      `🚀 Worker: Starting job ${job.id} for evaluation ${job.data.evaluationId}`
    );

    // Call real evaluation service
    const result = await evaluationService.processEvaluation(job.data);

    logger.info(`✅ Worker: Job ${job.id} completed successfully`);
    return result;
  } catch (error) {
    logger.error(`❌ Worker: Job ${job.id} failed:`, error);
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
