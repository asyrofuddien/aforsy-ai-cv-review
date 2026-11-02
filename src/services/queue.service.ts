import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import config from '../config/config';
import { CVMatcherRequest, EvaluationRequest } from '../types/evaluation.types';
import appLogger from '../utils/logger';
import { MatcherQueuePayload, ReviewQueuePayload } from '../features/queue/queue.types';
import { queueRepository } from '../features/queue/queue.repository';
import { enqueueWithCompensation } from '../features/queue/enqueue';

const logger = appLogger.child({ scope: 'queue' });

class QueueService {
  private evaluationQueue: Queue | null = null;
  private queueEvents: QueueEvents | null = null;
  private cvMatcherQueue: Queue | null = null;
  private cvMatcherQueueEvents: QueueEvents | null = null;
  private worker: Worker | null = null;
  private cvMatcherWorker: Worker | null = null;
  private closed = false;

  private ensureQueues(): void {
    if (this.closed) throw new Error('Queue service is closed');
    if (this.evaluationQueue) return;
    const connection = this.parseRedisUrl(config.database.redisUrl);
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 24 * 3600 },
    };
    this.evaluationQueue = new Queue('evaluation-queue', { connection, defaultJobOptions });
    this.queueEvents = new QueueEvents('evaluation-queue', { connection });
    this.cvMatcherQueue = new Queue('cv-matcher-queue', { connection, defaultJobOptions });
    this.cvMatcherQueueEvents = new QueueEvents('cv-matcher-queue', { connection });
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
    const queueEvents = this.queueEvents!;
    const cvMatcherQueueEvents = this.cvMatcherQueueEvents!;
    queueEvents.on('completed', ({ jobId }) => {
      logger.debug('Queue completion event', { jobId, queue: 'review' });
    });

    queueEvents.on('failed', ({ jobId }) => {
      logger.debug('Queue failure event', { jobId, queue: 'review' });
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`Job ${jobId} progress:`, data);
    });

    // Tambah event handlers untuk cvMatcherQueue
    cvMatcherQueueEvents.on('completed', ({ jobId }) => {
      logger.debug('Queue completion event', { jobId, queue: 'cv-matcher' });
    });

    cvMatcherQueueEvents.on('failed', ({ jobId }) => {
      logger.debug('Queue failure event', { jobId, queue: 'cv-matcher' });
    });

    cvMatcherQueueEvents.on('progress', ({ jobId, data }) => {
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
    this.ensureQueues();
    let evaluation: Awaited<ReturnType<typeof queueRepository.createReview>> | undefined;
    try {
      evaluation = await queueRepository.createReview(data, userId);

      const payload: ReviewQueuePayload = {
        evaluationId: evaluation.id,
        ...data,
      };
      const job = await enqueueWithCompensation({
        record: evaluation,
        enqueue: () => this.evaluationQueue!.add('evaluate', payload, { jobId: evaluation!.id }),
        compensate: (record, error) => queueRepository.markReviewEnqueueFailed(record.id, error instanceof Error ? error.message : 'Unable to enqueue review job'),
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

  initializeEvaluationWorker(processor: (_job: Job<ReviewQueuePayload>) => Promise<unknown>) {
    this.ensureQueues();
    if (this.worker) throw new Error('Evaluation worker is already initialized');
    const connection = this.parseRedisUrl(config.database.redisUrl);

    this.worker = new Worker('evaluation-queue', processor, {
      connection,
      concurrency: config.queue.concurrency,
    });

    this.worker.on('completed', (job) => {
      logger.debug('Worker completion event', { jobId: job.id });
    });

    this.worker.on('failed', (job, error) => {
      const attempt = job?.attemptsMade;
      const maxAttempts = Number(job?.opts.attempts) || 1;
      logger.error('Review job attempt failed', {
        jobId: job?.id,
        evaluationId: job?.data.evaluationId,
        attempt,
        maxAttempts,
        retrying: attempt !== undefined && attempt < maxAttempts,
        error,
      });
    });
  }

  initializeCVMatcherWorker(processor: (_job: Job<MatcherQueuePayload>) => Promise<unknown>) {
    this.ensureQueues();
    if (this.cvMatcherWorker) throw new Error('CV matcher worker is already initialized');
    const connection = this.parseRedisUrl(config.database.redisUrl);

    this.cvMatcherWorker = new Worker('cv-matcher-queue', processor, {
      connection,
      concurrency: config.queue.cvMatcherConcurrency,
    });

    this.cvMatcherWorker.on('completed', (job) => {
      logger.debug('Worker completion event', { jobId: job.id });
    });

    this.cvMatcherWorker.on('failed', (job, error) => {
      logger.error('CV matcher job failed', { jobId: job?.id, matcherId: job?.data.cvMatcherId, attempt: job?.attemptsMade, error });
    });
  }

  async getJob(jobId: string) {
    this.ensureQueues();
    return await this.evaluationQueue!.getJob(jobId);
  }

  // Tambah method untuk get CV Matcher job
  async getCVMatcherJob(jobId: string) {
    this.ensureQueues();
    return await this.cvMatcherQueue!.getJob(jobId);
  }

  async retryFailedJob(queueType: 'evaluation' | 'cv-matcher', jobId: string): Promise<boolean> {
    this.ensureQueues();
    const queue = queueType === 'evaluation' ? this.evaluationQueue! : this.cvMatcherQueue!;
    const job = await queue.getJob(jobId);
    if (!job || (await job.getState()) !== 'failed') return false;
    await job.retry('failed');
    return true;
  }

  async getJobState(queueType: 'evaluation' | 'cv-matcher', jobId: string): Promise<string | null> {
    this.ensureQueues();
    const queue = queueType === 'evaluation' ? this.evaluationQueue! : this.cvMatcherQueue!;
    const job = await queue.getJob(jobId);
    return job ? job.getState() : null;
  }

  async getJobCounts() {
    this.ensureQueues();
    return await this.evaluationQueue!.getJobCounts();
  }

  // Tambah method untuk get CV Matcher job counts
  async getCVMatcherJobCounts() {
    this.ensureQueues();
    return await this.cvMatcherQueue!.getJobCounts();
  }

  async close(force = false) {
    const workers = [this.worker, this.cvMatcherWorker].filter((worker): worker is Worker => worker !== null);
    const workerResults = await Promise.allSettled(workers.map(worker => worker.close(force)));
    const resources = [this.queueEvents, this.cvMatcherQueueEvents, this.evaluationQueue, this.cvMatcherQueue].filter((resource): resource is Queue | QueueEvents => resource !== null);
    const resourceResults = await Promise.allSettled(resources.map(resource => resource.close()));
    const failures = [...workerResults, ...resourceResults].filter(result => result.status === 'rejected');
    if (failures.length) {
      const error = new Error('Failed to close queue resources') as Error & { causes?: unknown[] };
      error.causes = failures.map(result => result.status === 'rejected' ? result.reason : undefined);
      throw error;
    }
    this.closed = true;
    this.worker = null;
    this.cvMatcherWorker = null;
    this.queueEvents = null;
    this.cvMatcherQueueEvents = null;
    this.evaluationQueue = null;
    this.cvMatcherQueue = null;
  }

  getQueue() {
    this.ensureQueues();
    return this.evaluationQueue!;
  }

  getCVMatcherQueue() {
    this.ensureQueues();
    return this.cvMatcherQueue!;
  }

  async addCVMatcher(
    data: CVMatcherRequest,
    userId: string,
  ): Promise<{
    id: string;
    jobId: string;
  }> {
    this.ensureQueues();
    let cvMatcher: Awaited<ReturnType<typeof queueRepository.createMatcher>> | undefined;
    try {
      cvMatcher = await queueRepository.createMatcher(data, userId);

      const payload: MatcherQueuePayload = {
        cvMatcherId: cvMatcher.id,
        ...data,
      };
      const job = await enqueueWithCompensation({
        record: cvMatcher,
        enqueue: () => this.cvMatcherQueue!.add('cv-matcher', payload, { jobId: cvMatcher!.id }),
        compensate: (record, error) => queueRepository.markMatcherEnqueueFailed(record.id, error instanceof Error ? error.message : 'Unable to enqueue CV matcher job'),
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
