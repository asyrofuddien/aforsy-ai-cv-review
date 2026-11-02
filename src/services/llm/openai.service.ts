import OpenAI from 'openai';
import config from '../../config/config';
import appLogger from '../../utils/logger';
import { retryWithBackoff } from '../../utils/retry';
import { AppError } from '../../middlewares/error.middleware';

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
    } = {},
  ): Promise<string> {
    const temperature = options.temperature ?? config.ai.temperature;
    const maxTokens = options.maxTokens ?? 2000;
    const model = config.ai.model;

    // Mock mode if no API key
    if (!this.isEnabled) {
      return this.mockCompletion(prompt, options);
    }

    try {
      const messages: { content: string; role: 'system' | 'user' }[] = [];

      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      messages.push({ role: 'user', content: prompt });

      const completion = await retryWithBackoff(
        async () => {
          return await this.client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
          });
        },
        {
          maxRetries: config.ai.maxRetries,
          delay: config.ai.retryDelay,
          onRetry: (attempt, error) => {
            logger.warn(`AI retry attempt ${attempt}:`, error.message);
          },
        },
      );

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      logger.debug('AI request failed', error);

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as any).code === 'rate_limit_exceeded'
      ) {
        throw new AppError('Rate limit exceeded, please try again later', 429);
      }

      throw new AppError('Failed to generate completion', 500);
    }
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
