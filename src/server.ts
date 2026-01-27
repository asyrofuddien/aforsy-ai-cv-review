import app from './app';
import { connectDB } from './config/database';
import { initializeVectorDB } from './config/vectordb';
import { startWorker } from './workers/evaluation.worker';
import config from './config/config';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';

// Ensure upload directories exist
const ensureUploadDirectories = () => {
  const uploadDir = config.upload.uploadDir;
  const directories = [
    uploadDir,
    path.join(uploadDir, 'temp'),
    path.join(uploadDir, 'cv'),
    path.join(uploadDir, 'project'),
  ];

  directories.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  });
};

const start = async () => {
  try {
    // Ensure upload directories exist
    ensureUploadDirectories();

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
