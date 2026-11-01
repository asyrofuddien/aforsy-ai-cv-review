import { Request, Response, NextFunction } from 'express';
import AuthSession from '../models/authSession.model';
import User from '../models/user.model';
import { AppError } from './error.middleware';
import { csrfHeaderName, getCookie, hashOpaqueToken, sessionCookieName, verifyCsrf } from '../services/auth.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = getCookie(req.headers.cookie, sessionCookieName);
    if (!token) throw new AppError('Authentication required', 401);

    const session = await AuthSession.findOne({
      tokenHash: hashOpaqueToken(token),
      expiresAt: { $gt: new Date() },
    }).select('+tokenHash +csrfHash');
    if (!session) throw new AppError('Session expired. Please sign in again.', 401);

    const user = await User.findById(session.userId);
    if (!user || !user.isActive) {
      await AuthSession.deleteMany({ userId: session.userId });
      throw new AppError('This account is unavailable', 403);
    }

    req.authUser = {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
    req.authSession = {
      id: session.id,
      csrfHash: session.csrfHash,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };

    if (MUTATING_METHODS.has(req.method) && !verifyCsrf(req.header(csrfHeaderName), session.csrfHash)) {
      throw new AppError('Security token missing or expired. Refresh the page and try again.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.authUser?.role !== 'admin') return next(new AppError('Administrator access required', 403));
  next();
};
