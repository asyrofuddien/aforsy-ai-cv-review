import { isStrongPassword } from '../features/auth/password-policy';
import { requestLocale } from '../utils/locale';
import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middlewares/error.middleware';
import User, { IUser } from '../models/user.model';
import AuthSession from '../models/authSession.model';
import {
  asPublicUser,
  clearSessionCookie,
  consumeEmailAction,
  createEmailAction,
  hashPassword,
  issueSession,
  promoteConfiguredAdmin,
  refreshSession,
  getSessionCsrfToken,
  getCookie,
  sessionCookieName,
  syncSessionCookieForAppRoutes,
  verifyPassword,
} from '../services/auth.service';
import {
  googleStart as startGoogleOAuth,
  googleCallback as finishGoogleOAuth,
} from '../features/auth/google-oauth.controller';
import { billingService } from '../features/billing/billing.service';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validatePassword = isStrongPassword;
const passwordMessage =
  'Use 12–128 characters with a lowercase letter, an uppercase letter, a number, and a special character.';
const readPassword = (value: unknown): string => {
  if (typeof value !== 'string' || !value.length || value.length > 128)
    throw new AppError('Password is required and must not exceed 128 characters.', 400);
  return value;
};

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
    if (!validatePassword(password)) throw new AppError(passwordMessage, 400);

    const existing = await User.findOne({ email }).select('+passwordHash');
    if (existing?.isEmailVerified)
      throw new AppError('An account already exists for this email', 409);

    const passwordHash = await hashPassword(password);
    const user = existing || new User({ email, displayName, passwordHash, isEmailVerified: false });
    user.displayName = displayName;
    user.passwordHash = passwordHash;
    await user.save();
    await createEmailAction(user, 'verify-email', requestLocale(req));

    res.status(202).json({ success: true, message: 'Check your email for a verification link.' });
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const email = requireString(req.body.email, 'Email', 254).toLowerCase();
    const password = readPassword(req.body.password);
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError('Email or password is incorrect', 401);
    }
    if (!user.isEmailVerified) throw new AppError('Verify your email before signing in', 403);
    if (!user.isActive) throw new AppError('This account is unavailable', 403);
    await promoteConfiguredAdmin(user);
    await billingService.grantWelcomeTrial(user.id);
    res.status(200).json({ success: true, data: await newSession(user, req, res) });
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    const user = await User.findById(req.authUser!.userId);
    if (!user) throw new AppError('Account not found', 404);
    syncSessionCookieForAppRoutes(req, res, req.authSession!.expiresAt);
    res.json({
      success: true,
      data: {
        user: asPublicUser(user),
        csrfToken: await getSessionCsrfToken(
          req.authSession!.id,
          getCookie(req.headers.cookie, sessionCookieName)!,
        ),
        expiresAt: req.authSession?.expiresAt,
      },
    });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    await AuthSession.findByIdAndDelete(req.authSession!.id);
    clearSessionCookie(req, res);
    res.json({ success: true, message: 'Signed out' });
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const refreshed = await refreshSession(req, res);
    if (!refreshed) throw new AppError('Session expired. Please sign in again.', 401);
    res.json({
      success: true,
      data: { csrfToken: refreshed.csrfToken, expiresAt: refreshed.expiresAt },
    });
  });

  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    const token = requireString(req.body.token, 'Verification token', 200);
    const user = await consumeEmailAction(token, 'verify-email');
    if (!user) throw new AppError('Verification link is invalid or expired', 400);
    user.isEmailVerified = true;
    await promoteConfiguredAdmin(user);
    await user.save();
    await billingService.grantWelcomeTrial(user.id);
    res.json({ success: true, message: 'Email verified. You can sign in now.' });
  });

  resendVerification = asyncHandler(async (req: Request, res: Response) => {
    const email = requireString(req.body.email, 'Email', 254).toLowerCase();
    if (!emailPattern.test(email)) throw new AppError('Enter a valid email address', 400);
    const user = await User.findOne({ email });
    if (user && !user.isEmailVerified && user.isActive)
      await createEmailAction(user, 'verify-email', requestLocale(req));
    res.json({
      success: true,
      message: 'If the account needs verification, a new link has been sent.',
    });
  });

  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const email = requireString(req.body.email, 'Email', 254).toLowerCase();
    if (!emailPattern.test(email)) throw new AppError('Enter a valid email address', 400);
    const user = await User.findOne({ email, isEmailVerified: true, isActive: true }).select(
      '+passwordHash',
    );
    if (user?.passwordHash) await createEmailAction(user, 'reset-password', requestLocale(req));
    res.json({
      success: true,
      message: 'If the account exists, a password reset link has been sent.',
    });
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const token = requireString(req.body.token, 'Reset token', 200);
    const password = req.body.password;
    if (!validatePassword(password)) throw new AppError(passwordMessage, 400);
    const user = await consumeEmailAction(token, 'reset-password');
    if (!user) throw new AppError('Password reset link is invalid or expired', 400);
    user.passwordHash = await hashPassword(password);
    await user.save();
    await AuthSession.deleteMany({ userId: user._id });
    res.json({ success: true, message: 'Password updated. Sign in with your new password.' });
  });

  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const currentPassword = readPassword(req.body.currentPassword);
    const newPassword = req.body.newPassword;
    if (!validatePassword(newPassword)) throw new AppError(passwordMessage, 400);
    const user = await User.findById(req.authUser!.userId).select('+passwordHash');
    if (!user?.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError('Current password is incorrect', 401);
    }
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    await AuthSession.deleteMany({ userId: user._id, _id: { $ne: req.authSession!.id } });
    res.json({ success: true, message: 'Password updated' });
  });

  googleStart = asyncHandler(startGoogleOAuth);

  googleCallback = asyncHandler(finishGoogleOAuth);
}

export default new AuthController();
