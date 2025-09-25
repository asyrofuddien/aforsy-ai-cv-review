import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorMiddleware } from './middlewares/error.middleware';
import { rateLimiterMiddleware } from './middlewares/rateLimiter.middleware';
import config from './config/config';
const path = require('path');

const app = express();

// Security middlewares
app.use(helmet());
app.use(cors());

// Rate limiting
app.use('/api/', rateLimiterMiddleware);

app.use('/docs', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self';"
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
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorMiddleware);

export default app;
