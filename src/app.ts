import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from './config/config';
import { errorHandler, notFound } from './middlewares/error.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import articleRoutes from './routes/article.routes';
import uploadRoutes from './routes/upload.routes';

const app: Application = express();

// Middlewares
app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL, // kalau ada
  'http://localhost:3000', // default dev
  'http://localhost:3001', 
].filter(Boolean); // buang undefined/null

app.use(
  cors({
    origin: (origin, callback) => {
      // Kalau origin tidak ada (misalnya Postman/curl), tetap izinkan
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/uploads', uploadRoutes);

import path from 'path';
app.use(
  '/uploads/images',
  express.static(path.join(__dirname, '../uploads/images'), {
    maxAge: '1d', // Cache images for 1 day
    etag: true,
    setHeaders: (res, _path) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

import fs from 'fs';
const uploadsDir = path.join(__dirname, '../uploads/images');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Health check
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// Error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
