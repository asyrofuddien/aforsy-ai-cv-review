import Joi from 'joi';

const optionalSecret = Joi.string().allow('').default('');
const positiveInteger = (fallback: number) => Joi.number().integer().min(1).default(fallback);
const validUrl = Joi.string().uri({ scheme: ['http', 'https'] });

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: positiveInteger(3001),
  HOST: Joi.string().trim().min(1).default('0.0.0.0'),
  MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).default('mongodb://localhost:27017/cv-evaluation'),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).default('redis://localhost:6379'),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: Joi.string().trim().min(1).default('gpt-4-turbo-preview'),
  SUMOPOD_API_KEY: optionalSecret,
  SUMOPOD_BASE_URL: validUrl.default('https://ai.sumopod.com/v1'),
  SUMOPOD_MODEL: Joi.string().trim().min(1).default('glm-5.3-flash'),
  LLM_TEMPERATURE: Joi.number().min(0).max(2).default(0.3),
  LLM_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(3),
  LLM_RETRY_DELAY: Joi.number().integer().min(0).default(1000),
  CREDIT_TRIAL_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  CREDIT_ADMIN_GRANTS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  PINECONE_API_KEY: optionalSecret,
  PINECONE_ENVIRONMENT: optionalSecret,
  PINECONE_INDEX_NAME: Joi.string().trim().min(1).default('cv-evaluation'),
  MAX_FILE_SIZE: positiveInteger(10 * 1024 * 1024),
  ALLOWED_FILE_TYPES: Joi.string().default('application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'),
  UPLOAD_DIR: Joi.string().trim().min(1).default('uploads'),
  QUEUE_CONCURRENCY: positiveInteger(2),
  CV_MATCHER_QUEUE_CONCURRENCY: positiveInteger(10),
  RATE_LIMIT_WINDOW_MS: positiveInteger(60000),
  RATE_LIMIT_MAX_REQUESTS: positiveInteger(120),
  CORS_ORIGINS: Joi.string().allow('').optional(),
  FRONTEND_URL: validUrl.default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GOOGLE_CALLBACK_URL: validUrl.default('http://localhost:3001/api/auth/google/callback'),
  ADMIN_EMAILS: Joi.string().allow('').default(''),
  EMAIL_FROM: Joi.string().trim().min(1).default('Landly <noreply@localhost>'),
  EMAIL_PROVIDER: Joi.string().valid('smtp', 'resend').allow('').optional(),
  RESEND_API_KEY: optionalSecret,
  RESEND_API_URL: validUrl.default('https://api.resend.com'),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: positiveInteger(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: optionalSecret,
  SMTP_PASSWORD: optionalSecret,
  BACKEND_API: validUrl.optional(),
  RAPIDAPI_KEY: optionalSecret,
  RAPIDAPI_HOST: Joi.string().trim().min(1).default('jobs-api14.p.rapidapi.com'),
  RAPIDAPI_BASE_URL: validUrl.default('https://jobs-api14.p.rapidapi.com'),
  RAPIDAPI_PLATFORM: Joi.string().valid('linkedin', 'indeed', 'bing', 'xing').default('linkedin'),
  RAPIDAPI_COUNTRY_CODE: Joi.string().trim().min(2).max(2).default('id'),
  RAPIDAPI_MAX_PAGES: Joi.number().integer().min(1).max(5).default(1),
  JOB_PROVIDER: Joi.string().valid('rapidapi', 'aggregate', 'greenhouse', 'lever').default('rapidapi'),
  JOB_PROVIDER_FALLBACK: Joi.string().valid('aggregate', 'none').default('aggregate'),
  GREENHOUSE_BOARDS: Joi.string().allow('').default(''),
  LEVER_SITES: Joi.string().allow('').default(''),
  SHUTDOWN_GRACE_PERIOD_MS: positiveInteger(30000),
  SHUTDOWN_FORCE_PERIOD_MS: positiveInteger(3000),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').optional(),
  LOG_DIR: Joi.string().trim().min(1).default('logs'),
  PUPPETEER_EXECUTABLE_PATH: Joi.string().allow('').optional(),
}).unknown(true);

export function parseEnvironment(input: NodeJS.ProcessEnv): Record<string, unknown> {
  const { error, value } = schema.validate(input, { abortEarly: false, convert: true });
  if (error) {
    const invalidKeys = [...new Set(error.details.map((detail) => detail.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${invalidKeys.join(', ')}`);
  }

  const nodeEnv = value.NODE_ENV as string;
  return {
    ...value,
    EMAIL_PROVIDER: value.EMAIL_PROVIDER || (nodeEnv === 'production' ? 'resend' : 'smtp'),
    SMTP_HOST: value.SMTP_HOST || (nodeEnv === 'development' ? 'localhost' : ''),
    SMTP_PORT: input.SMTP_PORT === undefined ? (nodeEnv === 'development' ? 1025 : 587) : value.SMTP_PORT,
    CORS_ORIGINS: value.CORS_ORIGINS === undefined
      ? (nodeEnv === 'development' ? 'http://localhost:3000,http://127.0.0.1:3000' : '')
      : value.CORS_ORIGINS,
  };
}
