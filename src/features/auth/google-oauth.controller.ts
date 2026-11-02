import { randomBytes, timingSafeEqual } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { Request, Response } from 'express';
import User, { IUser } from '../../models/user.model';
import config from '../../config/config';
import { AppError } from '../../middlewares/error.middleware';
import { getCookie, issueSession, promoteConfiguredAdmin } from './auth.service';

const googleClient = new OAuth2Client(config.auth.googleClientId, config.auth.googleClientSecret, config.auth.googleCallbackUrl);
const frontend = () => config.auth.frontendUrl.replace(/\/$/, '');

export async function googleStart(_req: Request, res: Response) {
  if (!config.auth.googleClientId || !config.auth.googleClientSecret) throw new AppError('Google sign-in is not configured', 503);
  const state = randomBytes(32).toString('base64url');
  res.cookie('landly_google_state', state, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(googleClient.generateAuthUrl({ access_type: 'online', scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }));
}

export async function googleCallback(req: Request, res: Response) {
  const queryState = typeof req.query.state === 'string' ? req.query.state : '';
  const cookieState = getCookie(req.headers.cookie, 'landly_google_state') || '';
  const left = Buffer.from(queryState);
  const right = Buffer.from(cookieState);
  res.clearCookie('landly_google_state', { httpOnly: true, secure: req.secure || config.nodeEnv === 'production', sameSite: 'lax', path: '/api/auth' });
  if (!left.length || left.length !== right.length || !timingSafeEqual(left, right)) throw new AppError('Google sign-in state validation failed', 400);
  if (typeof req.query.error === 'string' || typeof req.query.code !== 'string') return res.redirect(`${frontend()}/login?error=google_cancelled`);

  const { tokens } = await googleClient.getToken(req.query.code);
  if (!tokens.id_token) throw new AppError('Google did not return an identity token', 401);
  const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: config.auth.googleClientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) throw new AppError('Google account email is not verified', 401);
  const email = payload.email.toLowerCase();

  let user = (await User.findOne({ googleSub: payload.sub }).select('+googleSub')) as IUser | null;
  if (!user) {
    user = (await User.findOne({ email }).select('+googleSub')) as IUser | null;
    if (user && !user.isEmailVerified) return res.redirect(`${frontend()}/login?error=verify_email_first`);
    if (user) {
      if (user.googleSub && user.googleSub !== payload.sub) throw new AppError('This email is linked to a different Google account', 409);
      user.googleSub = payload.sub;
    } else {
      user = new User({ email, displayName: payload.name || email, googleSub: payload.sub, isEmailVerified: true });
    }
  }
  if (!user.isActive) throw new AppError('This account is unavailable', 403);
  user.isEmailVerified = true;
  await promoteConfiguredAdmin(user);
  await user.save();
  await issueSession(user, req, res);
  res.redirect(`${frontend()}/auth/callback`);
}
