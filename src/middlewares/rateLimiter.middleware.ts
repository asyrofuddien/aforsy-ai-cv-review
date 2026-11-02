import rateLimit from 'express-rate-limit';
import config from '../config/config';

export const rateLimiterMiddleware = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  // Auth endpoints have their own per-operation limits. Excluding them here
  // avoids normal API traffic consuming a user's login budget.
  skip: (req) => req.path === '/health' || req.path.startsWith('/auth/'),
  message: 'Too many requests from this IP, please try again later.',
  handler: (_req,res,_next,options) => res.status(options.statusCode).json({success:false,message:'Too many requests from this IP, please try again later.'}),
  standardHeaders: true,
  legacyHeaders: false,
});
