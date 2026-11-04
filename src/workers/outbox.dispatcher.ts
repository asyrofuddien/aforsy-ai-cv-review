import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { AiOperation, OutboxEvent } from '../models/billing.models';
import { operationService } from '../features/ai-operations/operation.service';
import queueService from '../services/queue.service';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'outbox-dispatcher' });
const MAX_ATTEMPTS = 8;
const LOCK_MS = 60_000;
const LEASE_MS = 30_000;
const LEASE_KEY = 'ai-outbox-dispatcher';

export class OutboxDispatcher {
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;
  private owner = randomUUID();

  start(intervalMs = 5_000): void {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    void this.tick();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.running) await new Promise(resolve => setTimeout(resolve, 25));
  }

  private async acquireSchedulerLease(): Promise<boolean> {
    const collection = mongoose.connection.collection('worker_leases');
    await collection.createIndex({ key: 1 }, { unique: true, name: 'worker_lease_key_unique' });
    const now = new Date();
    try {
      const result = await collection.findOneAndUpdate(
        { key: LEASE_KEY, $or: [{ leaseUntil: { $lte: now } }, { owner: this.owner }] },
        { $set: { owner: this.owner, leaseUntil: new Date(now.getTime() + LEASE_MS) } },
        { upsert: true, returnDocument: 'after' },
      );
      return (result as any)?.value?.owner === this.owner || (result as any)?.owner === this.owner;
    } catch (error: any) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  private async recoverExpiredOperations(): Promise<void> {
    const now = new Date();
    const expired = await AiOperation.find({ status: 'running', leaseUntil: { $lte: now } })
      .select('_id attemptCount maxAttempts').limit(50).lean();
    for (const op of expired) {
      if (op.attemptCount >= op.maxAttempts) {
        await AiOperation.updateOne({ _id: op._id, status: 'running', leaseUntil: { $lte: now } }, {
          $set: { status: 'queued' }, $unset: { workerToken: 1, leaseUntil: 1 }, $inc: { stateVersion: 1 },
        });
        try { await this.failExpiredOperation(String(op._id)); } catch (error) {
          logger.error('Unable to settle expired operation', { operationId: String(op._id), error });
        }
        continue;
      }
      const reclaimed = await AiOperation.updateOne({ _id: op._id, status: 'running', leaseUntil: { $lte: now } }, {
        $set: { status: 'queued' }, $unset: { workerToken: 1, leaseUntil: 1 }, $inc: { stateVersion: 1 },
      });
      if (reclaimed.modifiedCount !== 1) continue;
      await OutboxEvent.updateOne({ eventKey: `ai-operation.retry:${op._id}:${op.attemptCount}` }, { $setOnInsert: {
        eventKey: `ai-operation.retry:${op._id}:${op.attemptCount}`, type: 'ai-operation.retry', entityId: op._id,
        payload: { operationId: String(op._id) }, state: 'pending', attempts: 0, nextAttemptAt: now,
      } }, { upsert: true });
      logger.warn('Recovered expired AI operation lease', { operationId: String(op._id), attempt: op.attemptCount });
    }
  }

  private async failExpiredOperation(operationId: string): Promise<void> {
    await operationService.releaseTerminal(operationId, 'lease_expired_final');
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      if (!(await this.acquireSchedulerLease())) return;
      await this.recoverExpiredOperations();
      for (let count = 0; count < 25 && !this.stopping; count += 1) {
        const now = new Date();
        const event = await OutboxEvent.findOneAndUpdate({
          type: { $in: ['ai-operation.enqueue', 'ai-operation.retry'] },
          $or: [
            { state: 'pending', nextAttemptAt: { $lte: now } },
            { state: 'processing', lockedUntil: { $lte: now } },
          ],
        }, {
          $set: { state: 'processing', lockedUntil: new Date(now.getTime() + LOCK_MS) },
          $inc: { attempts: 1 },
        }, { sort: { createdAt: 1 }, new: true }).select('+payload');
        if (!event) break;
        try {
          const operationId = String((event.payload as any)?.operationId || event.entityId);
          const operation = await AiOperation.findById(operationId).select('maxAttempts status').lean();
          if (!operation || operation.status !== 'queued') {
            await OutboxEvent.updateOne({ _id: event._id }, { $set: { state: 'delivered', deliveredAt: new Date() }, $unset: { lockedUntil: 1 } });
            continue;
          }
          await queueService.addDurableOperationJob(operationId, operation.maxAttempts);
          await OutboxEvent.updateOne({ _id: event._id, state: 'processing' }, {
            $set: { state: 'delivered', deliveredAt: new Date() }, $unset: { lockedUntil: 1 },
          });
        } catch (error) {
          const attempts = event.attempts;
          const terminal = attempts >= MAX_ATTEMPTS;
          const delayMs = Math.min(15 * 60_000, 1_000 * (2 ** Math.min(attempts, 10)));
          await OutboxEvent.updateOne({ _id: event._id, state: 'processing' }, {
            $set: terminal
              ? { state: 'failed' }
              : { state: 'pending', nextAttemptAt: new Date(Date.now() + delayMs) },
            $unset: { lockedUntil: 1 },
          });
          logger.error('Outbox delivery attempt failed', { eventId: String(event._id), attempts, terminal, error });
        }
      }
    } catch (error) {
      logger.error('Outbox polling failed', { error });
    } finally {
      this.running = false;
    }
  }
}

export const outboxDispatcher = new OutboxDispatcher();
