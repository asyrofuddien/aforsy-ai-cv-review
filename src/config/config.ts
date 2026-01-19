import dotenv from 'dotenv';
import { model } from 'mongoose';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

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

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'groq-1',
    temperature: parseFloat(process.env.GROQ_TEMPERATURE || '0.3'),
    maxRetries: parseInt(process.env.GROQ_MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.GROQ_RETRY_DELAY || '1000'),
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

  backendApi: process.env.BACKEND_API,
};
