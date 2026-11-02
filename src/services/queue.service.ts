import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import config from '../config/config';
import Evaluation from '../models/evaluation.model';
import cvMatcherModel from '../models/cvMatcher.model';
import { CVMatcherRequest, EvaluationRequest } from '../types/evaluation.types';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'queue' });

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
      logger.debug('Queue completion event', { jobId, queue: 'review' });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.debug('Queue failure event', { jobId, queue: 'review' });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`Job ${jobId} progress:`, data);
    });

    // Tambah event handlers untuk cvMatcherQueue
    this.cvMatcherQueueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.debug('Queue completion event', { jobId, queue: 'cv-matcher' });
    });

    this.cvMatcherQueueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.debug('Queue failure event', { jobId, queue: 'cv-matcher' });
    });

    this.cvMatcherQueueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`CV Matcher job ${jobId} progress:`, data);
    });
  }

  async addEvaluationJob(
    data: EvaluationRequest,
    userId: string,
  ): Promise<{
    id: string;
    jobId: string;
  }> {
    try {
      const evaluation = new Evaluation({
        cvDocumentId: data.cvDocumentId,
        jobDescriptionId: data.jobDescriptionId,
        candidateName: data.candidateName,
        locale: data.locale || 'en',
        evaluationMode: data.jobDescriptionId || data.jobDescriptionText ? 'job_specific' : 'general',
        userId,
        status: 'queued',
      });
      evaluation.queueJobId = evaluation.id;

      await evaluation.save();

      const job = await this.evaluationQueue.add('evaluate', {
        evaluationId: evaluation.id,
        ...data,
      }, { jobId: evaluation.id });

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
      logger.debug('Worker completion event', { jobId: job.id });
    });

    this.worker.on('failed', (job, error) => {
      logger.error('Review job failed', { jobId: job?.id, evaluationId: job?.data.evaluationId, attempt: job?.attemptsMade, error });
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
      logger.debug('Worker completion event', { jobId: job.id });
    });

    this.cvMatcherWorker.on('failed', (job, error) => {
      logger.error('CV matcher job failed', { jobId: job?.id, matcherId: job?.data.cvMatcherId, attempt: job?.attemptsMade, error });
    });
  }

  async getJob(jobId: string) {
    return await this.evaluationQueue.getJob(jobId);
  }

  // Tambah method untuk get CV Matcher job
  async getCVMatcherJob(jobId: string) {
    return await this.cvMatcherQueue.getJob(jobId);
  }

  async retryFailedJob(queueType: 'evaluation' | 'cv-matcher', jobId: string): Promise<boolean> {
    const queue = queueType === 'evaluation' ? this.evaluationQueue : this.cvMatcherQueue;
    const job = await queue.getJob(jobId);
    if (!job || (await job.getState()) !== 'failed') return false;
    await job.retry('failed');
    return true;
  }

  async getJobState(queueType: 'evaluation' | 'cv-matcher', jobId: string): Promise<string | null> {
    const queue = queueType === 'evaluation' ? this.evaluationQueue : this.cvMatcherQueue;
    const job = await queue.getJob(jobId);
    return job ? job.getState() : null;
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
    userId: string,
  ): Promise<{
    id: string;
    jobId: string;
  }> {
    try {
      const cvMatcher = new cvMatcherModel({
        cvDocumentId: data.cvDocumentId,
        userId,
        status: 'queued',
      });
      cvMatcher.queueJobId = cvMatcher.id;

      await cvMatcher.save();

      const job = await this.cvMatcherQueue.add('cv-matcher', {
        cvMatcherId: cvMatcher.id,
        ...data,
      }, { jobId: cvMatcher.id });

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
