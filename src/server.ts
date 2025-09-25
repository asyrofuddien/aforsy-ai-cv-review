import app from './app';
import { connectDB } from './config/database';
import { initializeVectorDB } from './config/vectordb';
import { startWorker } from './workers/evaluation.worker';
import config from './config/config';
import logger from './utils/logger';

const start = async () => {
  try {
    // Connect to databases
    await connectDB();
    await initializeVectorDB();

    // Start background worker
    startWorker();

    // Start server
    const port = config.port;
    app.listen(port, () => {
      logger.info(`Server running on port ${port} in ${config.nodeEnv} mode`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
