import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, timingSafeEqual } from 'crypto';
import { asyncHandler, AppError } from '../middlewares/error.middleware';
import User, { IUser } from '../models/user.model';
import AuthSession from '../models/authSession.model';
import config from '../config/config';
import logger from '../utils/logger';
import {
  asPublicUser,
  clearSessionCookie,
  consumeEmailAction,
  createEmailAction,
  getCookie,
  hashPassword,
  hashOpaqueToken,
  issueSession,
  promoteConfiguredAdmin,
  refreshSession,
  rotateCsrfToken,
  verifyPassword,
} from '../services/auth.service';

const googleClient = new OAuth2Client(config.auth.googleClientId, config.auth.googleClientSecret, config.auth.googleCallbackUrl);
const frontend = () => config.auth.frontendUrl.replace(/\/$/, '');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validatePassword = (password: unknown): password is string =>
  typeof password === 'string' && password.length >= 12 && password.length <= 128;

const requireString = (value: unknown, field: string, maxLength = 200): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new AppError(`${field} is required`, 400);
  }
  return value.trim();
};

const newSession = async (user: IUser, req: Request, res: Response) => {
  const session = await issueSession(user, req, res);
  return { user: asPublicUser(user), csrfToken: session.csrfToken, expiresAt: session.expiresAt };
};

export class AuthController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const email = requireString(req.body.email, 'Email', 254).toLowerCase();
    const displayName = requireString(req.body.displayName, 'Name', 120);
    const password = req.body.password;
    if (!emailPattern.test(email)) throw new AppError('Enter a valid email address', 400);
    if (!validatePassword(password)) throw new AppError('Password must be 12 to 128 characters', 400);

    const existing = await User.findOne({ email }).select('+passwordHash');
    if (existing?.isEmailVerified) throw new AppError('An account already exists for this email', 409);

    const passwordHash = await hashPassword(password);
    const user = existing || new User({ email, displayName, passwordHash, isEmailVerified: false });
    user.displayName = displayName;
    user.passwordHash = passwordHash;
    await user.save();
    await createEmailAction(user, 'verify-email');

    res.status(202).json({ success: true, message: 'Check your email for a verification link.' });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const email = requireString(req.body.email, 'Email', 254).toLowerCase();
    const password = requireString(req.body.password, 'Password', 128);
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError('Email or password is incorrect', 401);
    }
    if (!user.isEmailVerified) throw new AppError('Verify your email before signing in', 403);
    if (!user.isActive) throw new AppError('This account is unavailable', 403);
    await promoteConfiguredAdmin(user);
    res.status(200).json({ success: true, data: await newSession(user, req, res) });
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findById(req.authUser!.userId);
    if (!user) throw new AppError('Account not found', 404);
    res.json({ success: true, data: { user: asPublicUser(user), csrfToken: await rotateCsrfToken(req.authSession!.id), expiresAt: req.authSession?.expiresAt } });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    await AuthSession.findByIdAndDelete(req.authSession!.id);
    clearSessionCookie(req, res);
    res.json({ success: true, message: 'Signed out' });
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const refreshed = await refreshSession(req, res);
    if (!refreshed) throw new AppError('Session expired. Please sign in again.', 401);
    res.json({ success: true, data: { csrfToken: refreshed.csrfToken, expiresAt: refreshed.expiresAt } });
  });

  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    const token = requireString(req.body.token, 'Verification token', 200);
    const user = await consumeEmailAction(token, 'verify-email');
    if (!user) throw new AppError('Verification link is invalid or expired', 400);
    user.isEmailVerified = true;
    await promoteConfiguredAdmin(user);
    await user.save();
    res.json({ success: true, message: 'Email verified. You can sign in now.' });
  });

  resendVerification = asyncHandler(async (req: Request, res: Response) => {
    const email = requireString(req.body.email, 'Email', 254).toLowerCase();
    if (!emailPattern.test(email)) throw new AppError('Enter a valid email address', 400);
    const user = await User.findOne({ email });
    if (user && !user.isEmailVerified && user.isActive) await createEmailAction(user, 'verify-email');
    res.json({ success: true, message: 'If the account needs verification, a new link has been sent.' });
  });

  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const email = requireString(req.body.email, 'Email', 254).toLowerCase();
    if (!emailPattern.test(email)) throw new AppError('Enter a valid email address', 400);
    const user = await User.findOne({ email, isEmailVerified: true, isActive: true }).select('+passwordHash');
    if (user?.passwordHash) await createEmailAction(user, 'reset-password');
    res.json({ success: true, message: 'If the account exists, a password reset link has been sent.' });
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const token = requireString(req.body.token, 'Reset token', 200);
    const password = req.body.password;
    if (!validatePassword(password)) throw new AppError('Password must be 12 to 128 characters', 400);
    const user = await consumeEmailAction(token, 'reset-password');
    if (!user) throw new AppError('Password reset link is invalid or expired', 400);
    user.passwordHash = await hashPassword(password);
    await user.save();
    await AuthSession.deleteMany({ userId: user._id });
    res.json({ success: true, message: 'Password updated. Sign in with your new password.' });
  });

  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const currentPassword = requireString(req.body.currentPassword, 'Current password', 128);
    const newPassword = req.body.newPassword;
    if (!validatePassword(newPassword)) throw new AppError('New password must be 12 to 128 characters', 400);
    const user = await User.findById(req.authUser!.userId).select('+passwordHash');
    if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError('Current password is incorrect', 401);
    }
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    await AuthSession.deleteMany({ userId: user._id, _id: { $ne: req.authSession!.id } });
    res.json({ success: true, message: 'Password updated' });
  });

  googleStart = asyncHandler(async (_req: Request, res: Response) => {
    if (!config.auth.googleClientId || !config.auth.googleClientSecret) {
      throw new AppError('Google sign-in is not configured', 503);
    }
    const state = randomBytes(32).toString('base64url');
    res.cookie('landly_google_state', state, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(googleClient.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
    }));
  });

  googleCallback = asyncHandler(async (req: Request, res: Response) => {
    const queryState = typeof req.query.state === 'string' ? req.query.state : '';
    const cookieState = getCookie(req.headers.cookie, 'landly_google_state') || '';
    const left = Buffer.from(queryState);
    const right = Buffer.from(cookieState);
    res.clearCookie('landly_google_state', { httpOnly: true, secure: req.secure || config.nodeEnv === 'production', sameSite: 'lax', path: '/api/auth' });
    if (!left.length || left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new AppError('Google sign-in state validation failed', 400);
    }
    if (typeof req.query.error === 'string' || typeof req.query.code !== 'string') {
      return res.redirect(`${frontend()}/login?error=google_cancelled`);
    }

    const { tokens } = await googleClient.getToken(req.query.code);
    if (!tokens.id_token) throw new AppError('Google did not return an identity token', 401);
    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: config.auth.googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) throw new AppError('Google account email is not verified', 401);
    const email = payload.email.toLowerCase();

    let user = (await User.findOne({ googleSub: payload.sub }).select('+googleSub')) as IUser | null;
    if (!user) {
      user = (await User.findOne({ email }).select('+googleSub')) as IUser | null;
      if (user && !user.isEmailVerified) {
        return res.redirect(`${frontend()}/login?error=verify_email_first`);
      }
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
    await newSession(user, req, res);
    res.redirect(`${frontend()}/auth/callback`);
  });
}

export default new AuthController();
