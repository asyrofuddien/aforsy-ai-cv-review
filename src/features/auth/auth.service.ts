import { randomBytes, timingSafeEqual } from 'crypto';
import { hashOpaqueToken } from './credentials.crypto';
import {
  getCookie,
  sessionCookieName,
  clearSessionCookie,
  setSessionCookie,
} from './session-cookie.adapter';
export {
  clearSessionCookie,
  csrfHeaderName,
  getCookie,
  sessionCookieName,
  syncSessionCookieForAppRoutes,
} from './session-cookie.adapter';
export { hashOpaqueToken, hashPassword, verifyPassword } from './credentials.crypto';
export { createEmailAction, consumeEmailAction } from './email-actions.service';
import { Request, Response } from 'express';
import AuthSession from '../../models/authSession.model';
import type { IUser } from '../../models/user.model';
import config from '../../config/config';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const adminEmailSet = (): Set<string> =>
  new Set(
    config.auth.adminEmails
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

export const promoteConfiguredAdmin = async (user: IUser): Promise<IUser> => {
  if (adminEmailSet().has(user.email) && user.isEmailVerified && user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }
  return user;
};

export const issueSession = async (user: IUser, req: Request, res: Response) => {
  const rawToken = randomBytes(32).toString('base64url');
  const csrfToken = hashOpaqueToken(`csrf:${rawToken}`);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await AuthSession.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(rawToken),
    csrfHash: hashOpaqueToken(csrfToken),
    expiresAt,
  });
  setSessionCookie(req, res, rawToken, expiresAt);
  return { csrfToken, expiresAt };
};

export const refreshSession = async (req: Request, res: Response) => {
  const session = req.authSession;
  if (!session) throw new Error('Session is required');
  const absoluteExpiry = session.createdAt.getTime() + SESSION_MAX_AGE_MS;
  if (Date.now() >= absoluteExpiry) {
    await AuthSession.findByIdAndDelete(session.id);
    clearSessionCookie(req, res);
    return null;
  }

  // Keep the shared browser session and CSRF token stable across tabs.
  const rawToken = getCookie(req.headers.cookie, sessionCookieName);
  if (!rawToken) throw new Error('Session cookie is required');
  const csrfToken = await getSessionCsrfToken(session.id, rawToken);
  const expiresAt = new Date(Math.min(Date.now() + SESSION_TTL_MS, absoluteExpiry));
  await AuthSession.findByIdAndUpdate(session.id, { expiresAt });
  setSessionCookie(req, res, rawToken, expiresAt);
  return { csrfToken, expiresAt };
};

export const getSessionCsrfToken = async (sessionId: string, rawToken: string): Promise<string> => {
  const csrfToken = hashOpaqueToken(`csrf:${rawToken}`);
  // Also upgrades sessions issued before deterministic CSRF tokens were introduced.
  await AuthSession.findByIdAndUpdate(sessionId, { csrfHash: hashOpaqueToken(csrfToken) });
  return csrfToken;
};

export const verifyCsrf = (provided: string | undefined, expectedHash: string): boolean => {
  if (!provided) return false;
  const actual = Buffer.from(hashOpaqueToken(provided), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const asPublicUser = (user: IUser) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
});
