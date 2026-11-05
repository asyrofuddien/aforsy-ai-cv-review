import { Request, Response, NextFunction } from 'express';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'http-error' });

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorMiddleware = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let error = { ...err };
  error.message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new AppError(message, 404);
  }

  // Mongoose duplicate key
  if ((err as any).code === 11000) {
    const message = 'Duplicate field value entered';
    error = new AppError(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors)
      .map((val: any) => val.message)
      .join(', ');
    error = new AppError(message, 400);
  }

  const status = (error as AppError).statusCode || 500;
  res.locals.failureLogged = true;
  logger.log(status >= 500 ? 'error' : 'warn', 'Request failed', {
    status,
    method: req.method,
    route: req.baseUrl + (req.route?.path || req.path),
    error: err,
  });

  res.status(status).json({
    success: false,
    error: {
      message: error.message || 'Server Error',
    },
  });
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
