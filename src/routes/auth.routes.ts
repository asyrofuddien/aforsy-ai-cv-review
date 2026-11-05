import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import authController from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const createAuthLimiter = (
  windowMs: number,
  max: number,
  message: string,
  skipSuccessfulRequests = false,
) =>
  rateLimit({
    windowMs,
    max,
    message,
    handler: (_req, res, _next, options) =>
      res.status(options.statusCode).json({ success: false, message }),
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
  });

// Successful sign-ins do not consume the failed-login budget. Keep the limit
// high enough for shared office/mobile IPs while still slowing password abuse.
router.post(
  '/register',
  createAuthLimiter(15 * 60 * 1000, 10, 'Too many registration attempts. Please try again later.'),
  authController.register,
);
router.post(
  '/login',
  createAuthLimiter(
    15 * 60 * 1000,
    20,
    'Too many failed login attempts from this network. Please wait before trying again.',
    true,
  ),
  authController.login,
);
router.post(
  '/verify-email',
  createAuthLimiter(15 * 60 * 1000, 20, 'Too many verification attempts. Please try again later.'),
  authController.verifyEmail,
);
router.post(
  '/resend-verification',
  createAuthLimiter(
    60 * 60 * 1000,
    5,
    'Too many verification emails requested. Please try again later.',
  ),
  authController.resendVerification,
);
router.post(
  '/forgot-password',
  createAuthLimiter(60 * 60 * 1000, 5, 'Too many password reset requests. Please try again later.'),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  createAuthLimiter(
    15 * 60 * 1000,
    10,
    'Too many password reset attempts. Please try again later.',
  ),
  authController.resetPassword,
);
router.get('/google', authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);
router.post('/refresh', authenticate, authController.refresh);
router.post('/change-password', authenticate, authController.changePassword);

export default router;
