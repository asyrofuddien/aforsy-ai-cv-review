/// <reference path="./types/auth.d.ts" />
import { localeMiddleware } from './middlewares/locale.middleware';
import express from 'express';
import { requestLogging } from './middlewares/request-logging.middleware';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { rateLimiterMiddleware } from './middlewares/rateLimiter.middleware';
import config from './config/config';
const path = require('path');

const app = express();

app.use(requestLogging);
app.use(localeMiddleware);

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
    exposedHeaders: ['X-Request-ID'],
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

// Error handling
app.use(errorMiddleware);

export default app;
