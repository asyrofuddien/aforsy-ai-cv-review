import dotenv from 'dotenv';
import { model } from 'mongoose';
import path from 'path';
// Resolve from the process working directory so PM2 can load the same backend .env
// from both ts-node development (`src/`) and compiled runtime (`dist/`).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const nodeEnv = process.env.NODE_ENV || 'development';
const emailProvider = process.env.EMAIL_PROVIDER || (nodeEnv === 'production' ? 'resend' : 'smtp');

export default {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv,

  database: {
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cv-evaluation',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.LLM_RETRY_DELAY || '1000'),
  },

  ai: {
    apiKey: process.env.SUMOPOD_API_KEY || '',
    baseUrl: process.env.SUMOPOD_BASE_URL || 'https://ai.sumopod.com/v1',
    model: process.env.SUMOPOD_MODEL || 'glm-5.3-flash',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.LLM_RETRY_DELAY || '1000'),
  },

  pinecone: {
    apiKey: process.env.PINECONE_API_KEY || '',
    environment: process.env.PINECONE_ENVIRONMENT || '',
    indexName: process.env.PINECONE_INDEX_NAME || 'cv-evaluation',
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || '').split(','),
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
  },

  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '2'),
    evaluationTimeout: parseInt(process.env.EVALUATION_TIMEOUT || '300000'),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10'),
  },

  cors: {
    allowedOrigins: (String(process.env.CORS_ORIGINS) || '').split(','),
  },

  auth: {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
    adminEmails: process.env.ADMIN_EMAILS || '',
    emailFrom: process.env.EMAIL_FROM || 'Landly <noreply@localhost>',
    emailProvider: emailProvider.toLowerCase(),
    resendApiKey: process.env.RESEND_API_KEY || '',
    resendApiUrl: (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/$/, ''),
    smtpHost: process.env.SMTP_HOST || (nodeEnv === 'development' ? 'localhost' : ''),
    smtpPort: parseInt(process.env.SMTP_PORT || (nodeEnv === 'development' ? '1025' : '587')),
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
  },

  backendApi: process.env.BACKEND_API,
};
