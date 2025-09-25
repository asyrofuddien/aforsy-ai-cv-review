export const EVALUATION_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export const DOCUMENT_TYPES = {
  CV: 'cv',
  PROJECT: 'project',
} as const;

export const ERROR_MESSAGES = {
  FILE_NOT_FOUND: 'File not found',
  INVALID_FILE_TYPE: 'Invalid file type',
  FILE_TOO_LARGE: 'File size exceeds limit',
  EVALUATION_NOT_FOUND: 'Evaluation not found',
  JOB_DESCRIPTION_NOT_FOUND: 'Job description not found',
  INVALID_REQUEST: 'Invalid request',
  INTERNAL_SERVER_ERROR: 'Internal server error',
} as const;

export const SUCCESS_MESSAGES = {
  FILE_UPLOADED: 'File uploaded successfully',
  EVALUATION_STARTED: 'Evaluation started successfully',
} as const;
