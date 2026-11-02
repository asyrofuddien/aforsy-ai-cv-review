import mongoose from 'mongoose';
import config from './config';
import appLogger from '../utils/logger';
import { ensureDefaultAtsTemplates } from '../services/atsTemplate.service';

const logger = appLogger.child({ scope: 'mongodb' });

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.database.mongoUri);
    await ensureDefaultAtsTemplates();
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};
