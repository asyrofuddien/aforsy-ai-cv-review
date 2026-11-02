import type { Request, Response } from 'express';
import config from '../../config/config';

export const sessionCookieName = 'landly_session';
export const csrfHeaderName = 'x-csrf-token';

const cookieOptions = (req: Request) => ({
  httpOnly: true,
  secure: req.secure || config.nodeEnv === 'production',
  sameSite: 'lax' as const,
});

export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: Date): void {
  res.clearCookie(sessionCookieName, { ...cookieOptions(req), path: '/api' });
  res.cookie(sessionCookieName, token, { ...cookieOptions(req), path: '/', expires: expiresAt });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const options = cookieOptions(req);
  res.clearCookie(sessionCookieName, { ...options, path: '/api' });
  res.clearCookie(sessionCookieName, { ...options, path: '/' });
}

export function getCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function syncSessionCookieForAppRoutes(req: Request, res: Response, expiresAt: Date): void {
  const token = getCookie(req.headers.cookie, sessionCookieName);
  if (token) setSessionCookie(req, res, token, expiresAt);
}
