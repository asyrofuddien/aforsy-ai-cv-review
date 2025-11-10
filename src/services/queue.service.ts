import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import config from '../config/config';
import Evaluation from '../models/evaluation.model';
import { EvaluationRequest } from '../types/evaluation.types';
import logger from '../utils/logger';

class QueueService {
  private evaluationQueue: Queue;
  private queueEvents: QueueEvents;
  private worker: Worker | null = null;

  constructor() {
    const connection = this.parseRedisUrl(config.database.redisUrl);

    this.evaluationQueue = new Queue('evaluation-queue', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 3600,
          count: 100,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
      },
    });

    this.queueEvents = new QueueEvents('evaluation-queue', {
      connection,
    });

    this.setupQueueEvents();
  }

  private parseRedisUrl(url: string): ConnectionOptions {
    const parsed = new URL(url);

    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port) || 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      db: parsed.pathname?.slice(1) ? parseInt(parsed.pathname.slice(1)) : undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
  }

  private setupQueueEvents() {
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info(`Job ${jobId} completed`);
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`Job ${jobId} failed:`, failedReason);
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`Job ${jobId} progress:`, data);
    });
  }

  async addEvaluationJob(data: EvaluationRequest): Promise<{
    id: string;
    jobId: string;
  }> {
    try {
      const evaluation = new Evaluation({
        cvDocumentId: data.cvDocumentId,
        jobDescriptionId: data.jobDescriptionId,
        candidateName: data.candidateName,
        status: 'queued',
      });

      await evaluation.save();

      const job = await this.evaluationQueue.add('evaluate', {
        evaluationId: evaluation.id,
        ...data,
      });

      if (!job.id) {
        throw new Error('Failed to create job - no job ID returned');
      }

      return {
        id: evaluation.id,
        jobId: job.id,
      };
    } catch (error) {
      logger.error('Failed to add evaluation job:', error);
      throw error;
    }
  }

  initializeWorker(processor: (job: Job) => Promise<any>) {
    const connection = this.parseRedisUrl(config.database.redisUrl);

    this.worker = new Worker('evaluation-queue', processor, {
      connection,
      concurrency: 5,
    });

    this.worker.on('completed', (job) => {
      logger.info(`Worker completed job ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      logger.error(`Worker failed on job ${job?.id}:`, error);
    });
  }

  async getJob(jobId: string) {
    return await this.evaluationQueue.getJob(jobId);
  }

  async getJobCounts() {
    return await this.evaluationQueue.getJobCounts();
  }

  async close() {
    await this.queueEvents.close();
    await this.evaluationQueue.close();
    if (this.worker) {
      await this.worker.close();
    }
  }

  getQueue() {
    return this.evaluationQueue;
  }
}

export default new QueueService();
