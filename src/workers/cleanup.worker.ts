import mongoose from 'mongoose';
import { AiOperationResult, OutboxEvent } from '../models/billing.models';
import UserNotification from '../models/userNotification.model';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'ai-result-cleanup' });
const DAY = 86_400_000;

export async function runAiResultCleanup(
  now = new Date(),
): Promise<{ expired: number; reminders: number }> {
  await UserNotification.collection.createIndex(
    { eventKey: 1 },
    { unique: true, name: 'notification_event_unique' },
  );
  const expired = await AiOperationResult.updateMany(
    { state: 'available', expiresAt: { $lte: now } },
    { $set: { state: 'expired' }, $unset: { resultData: 1 } },
  );
  const due = await AiOperationResult.find({
    state: 'available',
    reminderSentAt: null,
    expiresAt: { $gt: now, $lte: new Date(now.getTime() + 7 * DAY) },
  })
    .select('operationId userId expiresAt')
    .limit(500)
    .lean();
  let reminders = 0;
  for (const result of due) {
    const eventKey = `ai-result-expiry:${result.operationId}`;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const claimed = await AiOperationResult.updateOne(
          { _id: result._id, state: 'available', reminderSentAt: null },
          { $set: { reminderSentAt: now } },
          { session },
        );
        if (claimed.modifiedCount !== 1) return;
        const operation = (await mongoose
          .model('AiOperation')
          .findById(result.operationId)
          .select('locale')
          .session(session)
          .lean()) as any;
        const locale = operation?.locale === 'id' ? 'id' : 'en';
        await OutboxEvent.updateOne(
          { eventKey: `${eventKey}:email` },
          {
            $setOnInsert: {
              eventKey: `${eventKey}:email`,
              type: 'email.result_expiry_reminder',
              entityId: result.operationId,
              payload: {
                operationId: String(result.operationId),
                userId: String(result.userId),
                locale,
                expiresAt: result.expiresAt,
              },
              state: 'pending',
              attempts: 0,
              nextAttemptAt: now,
            },
          },
          { upsert: true, session },
        );
        await UserNotification.updateOne(
          { eventKey },
          {
            $setOnInsert: {
              userId: result.userId,
              eventKey,
              type: 'ai_result_expiring',
              title:
                locale === 'id' ? 'Hasil AI segera kedaluwarsa' : 'Your AI result is expiring soon',
              body:
                locale === 'id'
                  ? 'Simpan hasil ini sebelum masa penyimpanannya berakhir.'
                  : 'Save this result before its retention period ends.',
              entityId: result.operationId,
            },
          },
          { upsert: true, session },
        );
        reminders += 1;
      });
    } finally {
      await session.endSession();
    }
  }
  const expiredCount = expired.modifiedCount ?? 0;
  if (expiredCount || reminders)
    logger.info('AI result retention pass complete', { expired: expiredCount, reminders });
  return { expired: expiredCount, reminders };
}

export class AiResultCleanupWorker {
  private timer?: NodeJS.Timeout;
  private running = false;
  start(intervalMs = 60 * 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref();
    void this.run();
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await runAiResultCleanup();
    } catch (error) {
      logger.error('AI result retention pass failed', { error });
    } finally {
      this.running = false;
    }
  }
}
export const aiResultCleanupWorker = new AiResultCleanupWorker();
