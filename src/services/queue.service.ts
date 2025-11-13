import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import config from '../config/config';
import Evaluation from '../models/evaluation.model';
import cvMatcherModel from '../models/cvMatcher.model';
import { CVMatcherRequest, EvaluationRequest } from '../types/evaluation.types';
import logger from '../utils/logger';
import codeModel from '../models/code.model';

class QueueService {
  private evaluationQueue: Queue;
  private queueEvents: QueueEvents;
  private cvMatcherQueue: Queue;
  private cvMatcherQueueEvents: QueueEvents;
  private worker: Worker | null = null;
  private cvMatcherWorker: Worker | null = null; // Tambah worker untuk cv-matcher

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

    this.cvMatcherQueue = new Queue('cv-matcher-queue', {
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

    this.cvMatcherQueueEvents = new QueueEvents('cv-matcher-queue', {
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

    // Tambah event handlers untuk cvMatcherQueue
    this.cvMatcherQueueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info(`CV Matcher job ${jobId} completed`);
    });

    this.cvMatcherQueueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error(`CV Matcher job ${jobId} failed:`, failedReason);
    });

    this.cvMatcherQueueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`CV Matcher job ${jobId} progress:`, data);
    });
  }

  async addEvaluationJob(
    data: EvaluationRequest,
    code: string
  ): Promise<{
    id: string;
    jobId: string;
  }> {
    const codeData = await codeModel.findOne({ code });
    const codeId = codeData?._id;
    try {
      const evaluation = new Evaluation({
        cvDocumentId: data.cvDocumentId,
        jobDescriptionId: data.jobDescriptionId,
        candidateName: data.candidateName,
        code_id: codeId,
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

  initializeEvaluationWorker(processor: (job: Job) => Promise<any>) {
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

  // Tambah worker untuk CV Matcher
  initializeCVMatcherWorker(processor: (job: Job) => Promise<any>) {
    const connection = this.parseRedisUrl(config.database.redisUrl);

    this.cvMatcherWorker = new Worker('cv-matcher-queue', processor, {
      connection,
      concurrency: 10,
    });

    this.cvMatcherWorker.on('completed', (job) => {
      logger.info(`CV Matcher worker completed job ${job.id}`);
    });

    this.cvMatcherWorker.on('failed', (job, error) => {
      logger.error(`CV Matcher worker failed on job ${job?.id}:`, error);
    });
  }

  async getJob(jobId: string) {
    return await this.evaluationQueue.getJob(jobId);
  }

  // Tambah method untuk get CV Matcher job
  async getCVMatcherJob(jobId: string) {
    return await this.cvMatcherQueue.getJob(jobId);
  }

  async getJobCounts() {
    return await this.evaluationQueue.getJobCounts();
  }

  // Tambah method untuk get CV Matcher job counts
  async getCVMatcherJobCounts() {
    return await this.cvMatcherQueue.getJobCounts();
  }

  async close() {
    await this.queueEvents.close();
    await this.evaluationQueue.close();
    await this.cvMatcherQueueEvents.close();
    await this.cvMatcherQueue.close();
    if (this.worker) {
      await this.worker.close();
    }
    if (this.cvMatcherWorker) {
      // Tambah close untuk cv matcher worker
      await this.cvMatcherWorker.close();
    }
  }

  getQueue() {
    return this.evaluationQueue;
  }

  // Tambah method untuk get CV Matcher queue
  getCVMatcherQueue() {
    return this.cvMatcherQueue;
  }

  async addCVMatcher(
    data: CVMatcherRequest,
    codeId: string
  ): Promise<{
    id: string;
    jobId: string;
  }> {
    try {
      const cvMatcher = new cvMatcherModel({
        cvDocumentId: data.cvDocumentId,
        code_id: codeId,
        status: 'queued',
      });

      await cvMatcher.save();

      const job = await this.cvMatcherQueue.add('cv-matcher', {
        cvMatcherId: cvMatcher.id,
        ...data,
      });

      if (!job.id) {
        throw new Error('Failed to create job - no job ID returned');
      }

      return {
        id: cvMatcher.id,
        jobId: job.id, // Tambah jobId
      };
    } catch (error) {
      logger.error('Failed to add cvMatcher job:', error);
      throw error;
    }
  }
}

export default new QueueService();
