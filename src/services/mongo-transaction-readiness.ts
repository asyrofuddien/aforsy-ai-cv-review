import mongoose from 'mongoose';
import { AppError } from '../middlewares/error.middleware';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'mongo-transaction-readiness' });

export async function probeMongoTransactions(): Promise<boolean> {
  const connection = mongoose.connection;
  if (connection.readyState !== 1 || !connection.db) return false;

  let session: Awaited<ReturnType<typeof connection.startSession>> | undefined;
  try {
    session = await connection.startSession();
    session.startTransaction({ readConcern: { level: 'snapshot' }, readPreference: 'primary' });
    await connection.db
      .collection('users')
      .findOne(
        { _id: new mongoose.Types.ObjectId('000000000000000000000000') },
        { session, projection: { _id: 1 } },
      );
    await session.abortTransaction();
    return true;
  } catch (error) {
    if (session?.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch {
        logger.warn('Transaction readiness probe could not abort its read-only session');
      }
    }
    logger.warn('MongoDB transaction readiness probe failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  } finally {
    if (session) await session.endSession();
  }
}

export async function assertMongoTransactionsReady(): Promise<void> {
  if (!(await probeMongoTransactions())) {
    throw new AppError('MongoDB transaction support is unavailable.', 503);
  }
}
