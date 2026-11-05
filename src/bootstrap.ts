export interface ManagedHttpServer {
  close(_callback: (_error?: Error) => void): void;
  closeAllConnections?: () => void;
}

export interface BootstrapLogger {
  info(_message: string, _metadata?: unknown): void;
  warn(_message: string, _metadata?: unknown): void;
  error(_message: string, _metadata?: unknown): void;
  end?(): void;
  once?(_event: string, _listener: () => void): unknown;
  close?(): void;
}

export interface BootstrapDependencies<TServer extends ManagedHttpServer> {
  prepareFilesystem(): void | Promise<void>;
  connectDatabase(): Promise<void>;
  initializeVectorDB(): Promise<void>;
  startWorkers(): void | Promise<void>;
  listen(): Promise<TServer>;
  closeWorkers(_force?: boolean): Promise<void>;
  closeVectorDB(): Promise<void>;
  disconnectDatabase(): Promise<void>;
  logger: BootstrapLogger;
  gracefulTimeoutMs?: number;
  forceTimeoutMs?: number;
}

interface CleanupResource {
  name: string;
  close(_force: boolean): Promise<void>;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} exceeded ${timeoutMs}ms shutdown timeout`)),
        timeoutMs,
      );
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer!));
}

function createServerCloser(server: ManagedHttpServer): (_force: boolean) => Promise<void> {
  let closing: Promise<void> | null = null;
  return (force) => {
    if (force) server.closeAllConnections?.();
    if (!closing) {
      closing = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    return closing;
  };
}

export function createBootstrap<TServer extends ManagedHttpServer>(
  dependencies: BootstrapDependencies<TServer>,
) {
  const cleanup: CleanupResource[] = [];
  const gracefulTimeoutMs = dependencies.gracefulTimeoutMs ?? 30_000;
  const forceTimeoutMs = dependencies.forceTimeoutMs ?? 3_000;
  let server: TServer | null = null;
  let started = false;
  let stopping: Promise<void> | null = null;
  let removeSignalHandlers = () => undefined;
  let loggerClose: Promise<void> | null = null;
  if (dependencies.logger.end || dependencies.logger.close) {
    cleanup.push({
      name: 'logger transports',
      close: () => {
        if (!loggerClose) {
          loggerClose = new Promise((resolve) => {
            if (dependencies.logger.end && dependencies.logger.once) {
              dependencies.logger.once('finish', resolve);
              dependencies.logger.end();
            } else {
              dependencies.logger.close?.();
              resolve();
            }
          });
        }
        return loggerClose;
      },
    });
  }

  const shutdown = (reason = 'shutdown'): Promise<void> => {
    if (stopping) return stopping;
    stopping = (async () => {
      removeSignalHandlers();
      dependencies.logger.info('Graceful shutdown started', { reason });
      const errors: Error[] = [];
      const gracefulDeadline = Date.now() + gracefulTimeoutMs;
      for (const resource of cleanup.splice(0).reverse()) {
        try {
          const remainingMs = gracefulDeadline - Date.now();
          if (remainingMs <= 0)
            throw new Error(`${resource.name} exceeded the total graceful shutdown budget`);
          await withTimeout(resource.close(false), remainingMs, resource.name);
        } catch (error) {
          const cause = error instanceof Error ? error : new Error(String(error));
          dependencies.logger.warn('Graceful resource close failed; forcing close', {
            resource: resource.name,
            error: cause,
          });
          try {
            await withTimeout(resource.close(true), forceTimeoutMs, `${resource.name} force-close`);
          } catch (forceError) {
            const forceCause =
              forceError instanceof Error ? forceError : new Error(String(forceError));
            dependencies.logger.error('Resource force-close failed', {
              resource: resource.name,
              error: forceCause,
            });
            errors.push(forceCause);
          }
        }
      }
      server = null;
      started = false;
      dependencies.logger.info('Graceful shutdown finished', { reason, errors: errors.length });
      if (errors.length) {
        const error = new Error('One or more resources failed to close cleanly') as Error & {
          causes?: Error[];
        };
        error.causes = errors;
        throw error;
      }
    })();
    return stopping;
  };

  const start = async (): Promise<TServer> => {
    if (started) throw new Error('Backend bootstrap has already started');
    if (stopping) throw new Error('Backend bootstrap has already stopped');
    try {
      await dependencies.prepareFilesystem();

      cleanup.push({ name: 'MongoDB', close: () => dependencies.disconnectDatabase() });
      await dependencies.connectDatabase();

      cleanup.push({ name: 'Vector database', close: () => dependencies.closeVectorDB() });
      await dependencies.initializeVectorDB();

      // Register cleanup first so partially initialized queue resources are also closed.
      cleanup.push({
        name: 'BullMQ workers and queues',
        close: (force) => dependencies.closeWorkers(force),
      });
      await dependencies.startWorkers();

      server = await dependencies.listen();
      const closeHttpServer = createServerCloser(server);
      cleanup.push({ name: 'HTTP server', close: closeHttpServer });
      started = true;
      return server;
    } catch (error) {
      try {
        await shutdown('startup failure');
      } catch {
        /* preserve the startup error */
      }
      throw error;
    }
  };

  const installSignalHandlers = (signalSource: NodeJS.Process = process): (() => void) => {
    const handleSignal = (signal: NodeJS.Signals) => {
      void shutdown(signal).catch((error) =>
        dependencies.logger.error('Shutdown completed with errors', { signal, error }),
      );
    };
    const onSigterm = () => handleSignal('SIGTERM');
    const onSigint = () => handleSignal('SIGINT');
    signalSource.once('SIGTERM', onSigterm);
    signalSource.once('SIGINT', onSigint);
    removeSignalHandlers = () => {
      signalSource.off('SIGTERM', onSigterm);
      signalSource.off('SIGINT', onSigint);
    };
    return removeSignalHandlers;
  };

  return { start, shutdown, installSignalHandlers };
}
