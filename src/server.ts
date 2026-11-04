import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'node:http';
import app from './app';
import { createBootstrap } from './bootstrap';
import { connectDB, disconnectDB } from './config/database';
import { closeVectorDB, initializeVectorDB } from './config/vectordb';
import config from './config/config';
import { validateBillingStartup } from './config/environment';
import appLogger from './utils/logger';
import queueService from './services/queue.service';
import { startWorker } from './workers/evaluation.worker';
import { outboxDispatcher } from './workers/outbox.dispatcher';
import { aiResultCleanupWorker } from './workers/cleanup.worker';
import { localBillingReconciler } from './workers/reconciler.worker';

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
  closeWorkers: async force => { await outboxDispatcher.stop(); await localBillingReconciler.stop(); await aiResultCleanupWorker.stop(); await queueService.close(force); },
  closeVectorDB,
  disconnectDatabase: disconnectDB,
  logger,
  gracefulTimeoutMs: config.shutdown.gracePeriodMs,
  forceTimeoutMs: config.shutdown.forcePeriodMs,
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
  // Guard: LYNK_MERCHANT_KEY must be set when BILLING_MODE=live (REQ-M5-001 AC3)
  validateBillingStartup({ BILLING_MODE: config.billing.mode, LYNK_MERCHANT_KEY: config.billing.lynkMerchantKey });
  await runtime.start();
  runtime.installSignalHandlers();
};

void startServer().catch(error => {
  logger.error('Backend startup failed', { error });
  process.exitCode = 1;
});
