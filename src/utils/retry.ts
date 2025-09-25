import logger from './logger';

interface RetryOptions {
  maxRetries: number;
  delay: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: any) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, delay, backoffMultiplier = 2, onRetry } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const waitTime = delay * Math.pow(backoffMultiplier, attempt - 1);

      if (onRetry) {
        onRetry(attempt, error);
      }

      logger.debug(`Retry attempt ${attempt} - waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}
