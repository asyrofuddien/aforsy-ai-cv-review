import { createHash, randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';
import { Request, Response } from 'express';
import AuthSession from '../models/authSession.model';
import EmailToken, { EmailTokenPurpose } from '../models/emailToken.model';
import User, { IUser } from '../models/user.model';
import config from '../config/config';
import { sendAuthEmail } from './email.service';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'landly_session';
const CSRF_HEADER = 'x-csrf-token';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_TOKEN_TTL_MS = 60 * 60 * 1000;

export const hashOpaqueToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => {
  const [algorithm, salt, expectedHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString('hex')}`;
};

const adminEmailSet = (): Set<string> =>
  new Set(config.auth.adminEmails.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

export const promoteConfiguredAdmin = async (user: IUser): Promise<IUser> => {
  if (adminEmailSet().has(user.email) && user.isEmailVerified && user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }
  return user;
};

export const createEmailAction = async (user: IUser, purpose: EmailTokenPurpose): Promise<void> => {
  await EmailToken.deleteMany({ userId: user._id, purpose, usedAt: { $exists: false } });
  const rawToken = randomBytes(32).toString('base64url');
  await EmailToken.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(rawToken),
    purpose,
    expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
  });
  const url = new URL(purpose === 'verify-email' ? '/verify-email' : '/reset-password', config.auth.frontendUrl);
  url.searchParams.set('token', rawToken);
  await sendAuthEmail({ email: user.email, displayName: user.displayName, purpose, url: url.toString() });
};

export const consumeEmailAction = async (rawToken: string, purpose: EmailTokenPurpose) => {
  const token = await EmailToken.findOne({
    tokenHash: hashOpaqueToken(rawToken),
    purpose,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).select('+tokenHash');
  if (!token) return null;
  token.usedAt = new Date();
  await token.save();
  return User.findById(token.userId).select('+passwordHash +googleSub');
};

export const issueSession = async (user: IUser, req: Request, res: Response) => {
  const rawToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await AuthSession.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(rawToken),
    csrfHash: hashOpaqueToken(csrfToken),
    expiresAt,
  });
  res.cookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: req.secure || config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api',
    expires: expiresAt,
  });
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

  const rawToken = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Math.min(Date.now() + SESSION_TTL_MS, absoluteExpiry));
  await AuthSession.findByIdAndUpdate(session.id, {
    tokenHash: hashOpaqueToken(rawToken),
    csrfHash: hashOpaqueToken(csrfToken),
    expiresAt,
  });
  res.cookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: req.secure || config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api',
    expires: expiresAt,
  });
  return { csrfToken, expiresAt };
};

export const rotateCsrfToken = async (sessionId: string): Promise<string> => {
  const csrfToken = randomBytes(32).toString('base64url');
  await AuthSession.findByIdAndUpdate(sessionId, { csrfHash: hashOpaqueToken(csrfToken) });
  return csrfToken;
};

export const clearSessionCookie = (req: Request, res: Response) =>
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: req.secure || config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api',
  });

export const getCookie = (header: string | undefined, name: string): string | undefined => {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
};

export const sessionCookieName = SESSION_COOKIE;
export const csrfHeaderName = CSRF_HEADER;

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

