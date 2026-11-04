import dotenv from 'dotenv';
import path from 'path';
import { parseEnvironment } from './environment';

// Load the same project-root .env in ts-node, compiled Node and PM2 modes.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const env = parseEnvironment(process.env);

export default {
  port: env.PORT as number,
  host: env.HOST as string,
  nodeEnv: env.NODE_ENV as string,
  database: { mongoUri: env.MONGODB_URI as string, redisUrl: env.REDIS_URL as string },
  openai: {
    apiKey: env.OPENAI_API_KEY as string,
    model: env.OPENAI_MODEL as string,
    temperature: env.LLM_TEMPERATURE as number,
    maxRetries: env.LLM_MAX_RETRIES as number,
    retryDelay: env.LLM_RETRY_DELAY as number,
  },
  ai: {
    apiKey: env.SUMOPOD_API_KEY as string,
    baseUrl: (env.SUMOPOD_BASE_URL as string).replace(/\/$/, ''),
    model: env.SUMOPOD_MODEL as string,
    temperature: env.LLM_TEMPERATURE as number,
    maxRetries: env.LLM_MAX_RETRIES as number,
    retryDelay: env.LLM_RETRY_DELAY as number,
  },
  billing: {
    trialEnabled: env.CREDIT_TRIAL_ENABLED as boolean,
    adminTestPaymentsEnabled: env.BILLING_ADMIN_TEST_PAYMENTS_ENABLED as boolean,
    adminGrantsEnabled: env.CREDIT_ADMIN_GRANTS_ENABLED as boolean,
    mode: env.BILLING_MODE as 'disabled' | 'sandbox' | 'live',
    checkoutEnabled: env.BILLING_CHECKOUT_ENABLED as boolean,
    paidAiEnforcement: env.PAID_AI_ENFORCEMENT_ENABLED as boolean,
    // LYNK_MERCHANT_KEY is a secret — never log or include in responses.
    lynkMerchantKey: (env.LYNK_MERCHANT_KEY as string | undefined) || undefined,
    catalogVersion: env.BILLING_CATALOG_VERSION as string,
    aiCostPolicyVersion: env.AI_COST_POLICY_VERSION as string,
    reconcileIntervalMs: env.BILLING_RECONCILE_INTERVAL_MS as number,
  },
  pinecone: {
    apiKey: env.PINECONE_API_KEY as string,
    environment: env.PINECONE_ENVIRONMENT as string,
    indexName: env.PINECONE_INDEX_NAME as string,
  },
  upload: {
    maxFileSize: env.MAX_FILE_SIZE as number,
    allowedTypes: (env.ALLOWED_FILE_TYPES as string).split(',').map((type) => type.trim()).filter(Boolean),
    uploadDir: env.UPLOAD_DIR as string,
  },
  queue: {
    concurrency: env.QUEUE_CONCURRENCY as number,
    cvMatcherConcurrency: env.CV_MATCHER_QUEUE_CONCURRENCY as number,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS as number,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS as number,
  },
  cors: {
    allowedOrigins: (env.CORS_ORIGINS as string).split(',').map((origin) => origin.trim()).filter(Boolean),
  },
  auth: {
    frontendUrl: env.FRONTEND_URL as string,
    googleClientId: env.GOOGLE_CLIENT_ID as string,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET as string,
    googleCallbackUrl: env.GOOGLE_CALLBACK_URL as string,
    adminEmails: env.ADMIN_EMAILS as string,
    emailFrom: env.EMAIL_FROM as string,
    emailProvider: env.EMAIL_PROVIDER as string,
    resendApiKey: env.RESEND_API_KEY as string,
    resendApiUrl: (env.RESEND_API_URL as string).replace(/\/$/, ''),
    smtpHost: env.SMTP_HOST as string,
    smtpPort: env.SMTP_PORT as number,
    smtpSecure: env.SMTP_SECURE as boolean,
    smtpUser: env.SMTP_USER as string,
    smtpPassword: env.SMTP_PASSWORD as string,
  },
  jobs: {
    provider: env.JOB_PROVIDER as string,
    fallback: env.JOB_PROVIDER_FALLBACK as string,
    rapidApiKey: env.RAPIDAPI_KEY as string,
    rapidApiHost: env.RAPIDAPI_HOST as string,
    rapidApiBaseUrl: (env.RAPIDAPI_BASE_URL as string).replace(/\/$/, ''),
    rapidApiPlatform: env.RAPIDAPI_PLATFORM as 'linkedin' | 'indeed' | 'bing' | 'xing',
    rapidApiCountryCode: env.RAPIDAPI_COUNTRY_CODE as string,
    rapidApiMaxPages: env.RAPIDAPI_MAX_PAGES as number,
    greenhouseBoards: (env.GREENHOUSE_BOARDS as string).split(',').map((item) => item.trim()).filter(Boolean),
    leverSites: (env.LEVER_SITES as string).split(',').map((item) => item.trim()).filter(Boolean),
  },
  shutdown: {
    gracePeriodMs: env.SHUTDOWN_GRACE_PERIOD_MS as number,
    forcePeriodMs: env.SHUTDOWN_FORCE_PERIOD_MS as number,
  },
  logging: {
    level: env.LOG_LEVEL as string | undefined,
    directory: env.LOG_DIR as string,
  },
  puppeteer: { executablePath: env.PUPPETEER_EXECUTABLE_PATH as string | undefined },
  backendApi: env.BACKEND_API as string | undefined,
};
