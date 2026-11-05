import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import config from '../../config/config';
import appLogger from '../../utils/logger';
import { AppError } from '../../middlewares/error.middleware';
import AiUsage from '../../models/aiUsage.model';
import { logContext } from '../../utils/log-context';

const logger = appLogger.child({ scope: 'ai' });

class OpenAIService {
  private client!: OpenAI;
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = !!config.ai.apiKey;

    if (this.isEnabled) {
      this.client = new OpenAI({
        apiKey: config.ai.apiKey,
        baseURL: config.ai.baseUrl,
        maxRetries: 0,
      });
      logger.info(`✅ AI service initialized (${config.ai.model})`);
    } else {
      logger.warn('⚠️ AI service disabled - using mock mode');
    }
  }

  async completion(
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      stage?: string;
      rejectTruncated?: boolean;
    } = {},
  ): Promise<string> {
    const temperature = options.temperature ?? config.ai.temperature;
    const maxTokens = options.maxTokens ?? 2000;
    const model = config.ai.model;

    // Mock mode if no API key
    if (!this.isEnabled) {
      return this.mockCompletion(prompt, options);
    }

    const messages: { content: string; role: 'system' | 'user' }[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const callId = randomUUID();
    const maxAttempts = Math.max(1, Math.min(3, config.ai.maxRetries));
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = performance.now();
      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        });
      } catch (error) {
        const status = this.readErrorStatus(error);
        const code = this.readErrorCode(error);
        await this.recordUsage({
          callId,
          stage: options.stage,
          attempt,
          model,
          latencyMs: Math.round(performance.now() - startedAt),
          requestId: this.readErrorRequestId(error),
          status: 'failed',
          failureCode: code || (status ? `http_${status}` : 'provider_error'),
        });
        logger.warn('AI provider attempt failed', {
          stage: options.stage || 'unspecified',
          attempt,
          maxAttempts,
          status,
          code,
        });
        if (attempt < maxAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, config.ai.retryDelay * 2 ** (attempt - 1)),
          );
          continue;
        }
        if (code === 'rate_limit_exceeded' || status === 429) {
          throw new AppError('Rate limit exceeded, please try again later', 429);
        }
        throw new AppError('Failed to generate completion', 500);
      }

      const usage = completion.usage;
      const finishReason = completion.choices[0]?.finish_reason;
      const truncated = options.rejectTruncated && finishReason === 'length';
      await this.recordUsage({
        callId,
        stage: options.stage,
        attempt,
        model: completion.model || model,
        inputTokens: usage?.prompt_tokens ?? null,
        outputTokens: usage?.completion_tokens ?? null,
        usageAvailability:
          usage?.prompt_tokens !== undefined && usage?.completion_tokens !== undefined
            ? 'reported'
            : 'unknown',
        latencyMs: Math.round(performance.now() - startedAt),
        requestId: this.readResponseRequestId(completion),
        finishReason: completion.choices[0]?.finish_reason || undefined,
        status: truncated ? 'failed' : 'succeeded',
        failureCode: truncated ? 'response_truncated' : undefined,
      });
      if (truncated) {
        logger.warn('AI response reached its token limit; rejecting incomplete output', {
          stage: options.stage || 'unspecified',
          maxTokens,
          outputTokens: usage?.completion_tokens,
          requestId: this.readResponseRequestId(completion),
        });
        throw new AppError('AI response was truncated. Please retry the review.', 502);
      }
      return completion.choices[0]?.message?.content || '';
    }

    throw new AppError('Failed to generate completion', 500);
  }

  private async recordUsage(data: {
    callId: string;
    stage?: string;
    attempt: number;
    model: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    usageAvailability?: 'reported' | 'unknown';
    latencyMs: number;
    requestId?: string;
    finishReason?: string;
    status: 'succeeded' | 'failed';
    failureCode?: string;
  }): Promise<void> {
    const context = logContext.getStore();
    const reference = context?.evaluationId
      ? { referenceType: 'evaluation' as const, referenceId: context.evaluationId }
      : context?.cvMatcherId
        ? { referenceType: 'cv_matcher' as const, referenceId: context.cvMatcherId }
        : { referenceType: 'unattributed' as const, referenceId: undefined };

    await AiUsage.create({
      callId: data.callId,
      ...reference,
      stage: data.stage || 'unspecified',
      attempt: data.attempt,
      provider: config.ai.baseUrl.includes('sumopod.com') ? 'sumopod' : 'openai-compatible',
      model: data.model.slice(0, 128),
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      usageAvailability:
        data.usageAvailability ||
        (data.inputTokens !== undefined &&
        data.inputTokens !== null &&
        data.outputTokens !== undefined &&
        data.outputTokens !== null
          ? 'reported'
          : 'unknown'),
      latencyMs: data.latencyMs,
      requestId: data.requestId?.slice(0, 128),
      finishReason: data.finishReason?.slice(0, 80),
      status: data.status,
      failureCode: data.failureCode?.slice(0, 80),
    });
  }

  private readErrorStatus(error: unknown): number | undefined {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number'
    ) {
      return error.status;
    }
    return undefined;
  }

  private readErrorCode(error: unknown): string | undefined {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      /^[a-z0-9_-]{1,64}$/i.test(error.code)
    ) {
      return error.code;
    }
    return undefined;
  }

  private readErrorRequestId(error: unknown): string | undefined {
    if (
      typeof error === 'object' &&
      error !== null &&
      'request_id' in error &&
      typeof error.request_id === 'string'
    ) {
      return error.request_id.slice(0, 128);
    }
    return undefined;
  }

  private readResponseRequestId(response: unknown): string | undefined {
    if (
      typeof response === 'object' &&
      response !== null &&
      '_request_id' in response &&
      typeof response._request_id === 'string'
    ) {
      return response._request_id.slice(0, 128);
    }
    return undefined;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Sumopod's documented API provides text chat completions, not embeddings.
    return this.mockEmbedding(text);
  }

  // Mock functions for testing without API key
  private mockCompletion(prompt: string, _options: any): string {
    logger.info('🤖 Mock: Generating mock completion');

    if (prompt.includes('extract') && prompt.includes('CV')) {
      return JSON.stringify({
        skills: ['Node.js', 'TypeScript', 'MongoDB', 'AWS'],
        experience_years: 5,
        experiences: [
          {
            company: 'Tech Corp',
            position: 'Senior Backend Engineer',
            duration: '2020-2023',
            description: 'Developed scalable APIs',
          },
        ],
        education: [
          {
            institution: 'University',
            degree: 'BSc Computer Science',
            year: '2018',
          },
        ],
      });
    }

    return 'Mock response for: ' + prompt.substring(0, 50) + '...';
  }

  private mockEmbedding(text: string): number[] {
    // Generate consistent mock embedding based on text
    const mockDimension = 384; // text-embedding-3-small dimension
    const embedding = new Array(mockDimension);

    for (let i = 0; i < mockDimension; i++) {
      embedding[i] = Math.sin((text.length + i) * 0.1) * 0.5;
    }

    return embedding;
  }
}

export default new OpenAIService();
