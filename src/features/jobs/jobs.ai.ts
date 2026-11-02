import appLogger from '../../utils/logger';
import { JOBS_PROMPTS } from './jobs.prompts';
import { AIJsonService } from '../../services/llm/json-response';
import openaiService from '../../services/llm/openai.service';


const logger = appLogger.child({ scope: 'ai-chain' });

export class JobsAIService extends AIJsonService {
async beautifyDescription(description: string): Promise<any> {
    try {
      logger.debug('🔗 Chain: beautifyDescription');
      const response = await openaiService.completion(JOBS_PROMPTS.BEAUTIFY_DESCRIPTION.user(description), {
        systemPrompt: JOBS_PROMPTS.BEAUTIFY_DESCRIPTION.system,
        temperature: 0.1,
      });

      const parsed = this.parseJSON(response, {
        description: description.substring(0, 200) + '...', // Fallback to truncated original
      });

      // Validate description exists
      if (!parsed.description || parsed.description === '') {
        parsed.description = description.substring(0, 200) + '...';
        logger.warn('Description beautification failed, using truncated original');
      }

      logger.debug('✅ Chain: beautifyDescription completed');
      return parsed;
    } catch (error) {
      logger.debug('Chain: beautifyDescription error:', error);
      return {
        description: description.substring(0, 200) + '...',
      };
    }
  }

async calculateSkillmatch(cvSkills: any, jobRequirements: any): Promise<any> {
    try {
      logger.debug('🔗 Chain: calculateSkillmatch');
      const response = await openaiService.completion(JOBS_PROMPTS.CALCULATE_SKILL.user(cvSkills, jobRequirements), {
        systemPrompt: JOBS_PROMPTS.CALCULATE_SKILL.system,
        temperature: 0.1,
      });

      const parsed = this.parseJSON(response, {
        score: 0,
        explanation: 'Unable to calculate skill match',
      });

      // Ensure score is a valid number
      if (typeof parsed.score !== 'number' || isNaN(parsed.score)) {
        parsed.score = 0;
      }

      logger.debug('✅ Chain: calculateSkillmatch completed');
      return parsed;
    } catch (error) {
      logger.debug('Chain: calculateSkillmatch error:', error);
      return {
        score: 0,
        explanation: 'Error calculating skill match',
      };
    }
  }
}
