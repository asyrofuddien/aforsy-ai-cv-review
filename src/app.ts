/// <reference path="./types/auth.d.ts" />
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { rateLimiterMiddleware } from './middlewares/rateLimiter.middleware';
import { authenticate } from './middlewares/auth.middleware';
import Document from './models/document.model';
import config from './config/config';
const path = require('path');

const app = express();

// Security middlewares
app.use(helmet());

const allowedOrigins = config.cors.allowedOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

app.set('trust proxy', 1);

// Rate limiting
app.use('/api/', rateLimiterMiddleware);

app.use('/docs', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self';",
  );
  next();
});

app.use('/docs', express.static(path.join(__dirname, '../public/docs')));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: 'v 2.0.0',
    timestamp: new Date().toISOString(),
  });
});
app.get('/api/pdf/:filename', authenticate, async (req, res, next) => {
  const { filename } = req.params;
  try {
    const document = await Document.findOne({ filename, userId: req.authUser!.userId }).select('path');
    if (!document) return res.status(404).json({ success: false, message: 'Document not found' });
    res.sendFile(path.resolve(document.path), (error) => error && next(error));
  } catch (error) {
    next(error);
  }
});

// Error handling
app.use(errorMiddleware);

export default app;
