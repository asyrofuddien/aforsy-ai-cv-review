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
  })
);

app.set('trust proxy', 1);

// Rate limiting
app.use('/api/', rateLimiterMiddleware);

app.use('/docs', (req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " + "script-src 'self'; " + "style-src 'self' 'unsafe-inline'; " + "img-src 'self' data:; " + "font-src 'self';"
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
    version: 'v 1.0.1',
    timestamp: new Date().toISOString(),
  });
});
app.use('/results', express.static(path.join(__dirname, '../results')));

app.get('/api/pdf/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads/temp', filename);
  res.sendFile(filePath);
});

// Error handling
app.use(errorMiddleware);

export default app;
