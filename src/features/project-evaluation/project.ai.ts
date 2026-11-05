import appLogger from '../../utils/logger';
import { PROJECT_PROMPTS } from './project.prompts';
import { AIJsonService } from '../../services/llm/json-response';
import openaiService from '../../services/llm/openai.service';

const logger = appLogger.child({ scope: 'ai-chain' });

export class ProjectAIService extends AIJsonService {
  async evaluateProject(projectContent: string, rubric: any): Promise<any> {
    try {
      logger.debug('🔗 Chain: Evaluating project');

      const response = await openaiService.completion(
        PROJECT_PROMPTS.PROJECT_EVALUATION.user(projectContent, rubric),
        {
          systemPrompt: PROJECT_PROMPTS.PROJECT_EVALUATION.system,
          temperature: 0.3,
          stage: 'project_evaluation',
        },
      );

      const parsed = this.parseJSON(response, {
        score: 3.0,
        feedback: 'Unable to evaluate',
        strengths: [],
        improvements: [],
        scores: {
          correctness: 3,
          codeQuality: 3,
          resilience: 3,
          documentation: 3,
          creativity: 3,
        },
      });

      // Validate scores are in 1-5 range
      if (parsed.scores) {
        for (const [key, value] of Object.entries(parsed.scores)) {
          if (typeof value === 'number') {
            parsed.scores[key] = Math.max(1, Math.min(5, value));
          }
        }
      }

      logger.debug('✅ Chain: Project evaluation completed');
      return parsed;
    } catch (error) {
      logger.debug('Chain: Project evaluation error:', error);
      throw error;
    }
  }
}
