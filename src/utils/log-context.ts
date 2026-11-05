import { AsyncLocalStorage } from 'node:async_hooks';
export const logContext = new AsyncLocalStorage<Record<string, string>>();
