import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'node:http';
import app from './app';
import { createBootstrap } from './bootstrap';
import { connectDB, disconnectDB } from './config/database';
import { closeVectorDB, initializeVectorDB } from './config/vectordb';
import config from './config/config';
import appLogger from './utils/logger';
import queueService from './services/queue.service';
import { startWorker } from './workers/evaluation.worker';

const logger = appLogger.child({ scope: 'server' });

const ensureUploadDirectories = (): void => {
  const uploadDir = config.upload.uploadDir;
  [uploadDir, path.join(uploadDir, 'temp'), path.join(uploadDir, 'cv'), path.join(uploadDir, 'project')]
    .forEach(directory => fs.mkdirSync(directory, { recursive: true }));
};

const runtime = createBootstrap<Server>({
  prepareFilesystem: ensureUploadDirectories,
  connectDatabase: connectDB,
  initializeVectorDB,
  startWorkers: startWorker,
  closeWorkers: force => queueService.close(force),
  closeVectorDB,
  disconnectDatabase: disconnectDB,
  logger,
  gracefulTimeoutMs: Number(process.env.SHUTDOWN_GRACE_PERIOD_MS) || 30_000,
  forceTimeoutMs: Number(process.env.SHUTDOWN_FORCE_PERIOD_MS) || 3_000,
  listen: () => new Promise<Server>((resolve, reject) => {
    const server = app.listen(Number(config.port), config.host);
    const onError = (error: Error) => {
      server.close();
      reject(error);
    };
    server.once('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      logger.info('HTTP server listening', { host: config.host, port: config.port, environment: config.nodeEnv });
      resolve(server);
    });
  }),
});

export const startServer = async (): Promise<void> => {
  await runtime.start();
  runtime.installSignalHandlers();
};

void startServer().catch(error => {
  logger.error('Backend startup failed', { error });
  process.exitCode = 1;
});
