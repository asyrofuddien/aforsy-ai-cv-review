import appLogger from '../../utils/logger';
import { JOBS_PROMPTS } from './jobs.prompts';
import { AIJsonService } from '../../services/llm/json-response';
import openaiService from '../../services/llm/openai.service';


const logger = appLogger.child({ scope: 'ai-chain' });

export class JobsAIService extends AIJsonService {
async beautifyDescription(description: string): Promise<{ description: string; fallback?: boolean }> {
    try {
      logger.debug('🔗 Chain: beautifyDescription');
      const response = await openaiService.completion(JOBS_PROMPTS.BEAUTIFY_DESCRIPTION.user(description), {
        systemPrompt: JOBS_PROMPTS.BEAUTIFY_DESCRIPTION.system,
        temperature: 0.1,
        stage: 'job_description_enhancement',
      });

      const parsed = this.parseJSON(response, null);
      if (typeof parsed?.description !== 'string' || parsed.description.trim() === '') {
        logger.warn('Description beautification returned invalid content; using truncated original');
        return { description: description.substring(0, 200) + '...', fallback: true };
      }

      logger.debug('✅ Chain: beautifyDescription completed');
      return parsed;
    } catch (error) {
      logger.warn('Chain: beautifyDescription failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return { description: description.substring(0, 200) + '...', fallback: true };
    }
  }

async calculateSkillmatch(cvSkills: any, jobRequirements: any): Promise<any> {
    try {
      logger.debug('🔗 Chain: calculateSkillmatch');
      const response = await openaiService.completion(JOBS_PROMPTS.CALCULATE_SKILL.user(cvSkills, jobRequirements), {
        systemPrompt: JOBS_PROMPTS.CALCULATE_SKILL.system,
        temperature: 0.1,
        stage: 'job_skill_scoring',
      });

      const parsed = this.parseJSON(response, null, true);
      if (typeof parsed?.score !== 'number' || !Number.isFinite(parsed.score)) {
        throw new Error('Skill matching returned an invalid score.');
      }

      logger.debug('✅ Chain: calculateSkillmatch completed');
      return parsed;
    } catch (error) {
      logger.warn('Chain: calculateSkillmatch failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }
}
