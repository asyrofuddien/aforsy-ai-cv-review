import openaiService from './openai.service';
import { PROMPTS } from './prompts';
import logger from '../../utils/logger';
import { CVExtractedInfo } from '../../types/evaluation.types';

export class LLMChainService {
  async extractCVInfo(cvContent: string): Promise<CVExtractedInfo> {
    try {
      logger.info('🔗 Chain: Extracting CV information');

      const response = await openaiService.completion(PROMPTS.CV_EXTRACTION.user(cvContent), {
        systemPrompt: PROMPTS.CV_EXTRACTION.system,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const parsed = this.parseJSON(response, {
        name: 'Unknown',
        email: '',
        skills: [],
        experience_years: 0,
        experiences: [],
        education: [],
        projects: [],
      });

      logger.info('✅ Chain: CV extraction completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: CV extraction error:', error);
      throw error;
    }
  }

  async evaluateCV(cvInfo: CVExtractedInfo, jobRequirements: any): Promise<any> {
    try {
      logger.info('🔗 Chain: Evaluating CV against job requirements');

      const response = await openaiService.completion(PROMPTS.CV_EVALUATION.user(cvInfo, jobRequirements), {
        systemPrompt: PROMPTS.CV_EVALUATION.system,
        temperature: 0.3,
      });

      const parsed = this.parseJSON(response, {
        match_rate: 0.5,
        strengths: [],
        gaps: [],
        feedback: 'Unable to evaluate',
        scores: {},
      });

      logger.info('✅ Chain: CV evaluation completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: CV evaluation error:', error);
      throw error;
    }
  }

  async evaluateProject(projectContent: string, rubric: any): Promise<any> {
    try {
      logger.info('🔗 Chain: Evaluating project');

      const response = await openaiService.completion(PROMPTS.PROJECT_EVALUATION.user(projectContent, rubric), {
        systemPrompt: PROMPTS.PROJECT_EVALUATION.system,
        temperature: 0.3,
      });

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

      logger.info('✅ Chain: Project evaluation completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: Project evaluation error:', error);
      throw error;
    }
  }

  async generateFinalSummary(cvEval: any) {
    try {
      logger.info('🔗 Chain: Generating final summary');

      const response = await openaiService.completion(PROMPTS.FINAL_SUMMARY.user(cvEval), {
        systemPrompt: PROMPTS.FINAL_SUMMARY.system,
        temperature: 0.4,
        maxTokens: 500,
      });

      const parsed = this.parseJSON(response, {
        match_rate: 0.5,
        strengths: [],
        gaps: [],
        feedback: 'Unable to evaluate',
        scores: {},
      });

      logger.info('✅ Chain: Final summary generated');
      return parsed;
    } catch (error) {
      logger.error('Chain: Final summary error:', error);
      throw error;
    }
  }

  private parseJSON(text: string, defaultValue: any): any {
    try {
      // Clean the response - remove markdown code blocks if present
      const cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(cleaned);
    } catch (error) {
      logger.error('Failed to parse JSON response:', text);
      logger.error('Parse error:', error);
      return defaultValue;
    }
  }

  async extractCVToJSON(rawText: string): Promise<any> {
    try {
      logger.info('🔗 Chain: Extract CV Structured JSON');

      const response = await openaiService.completion(PROMPTS.EXTRACT_CV_STRUCTURED_JSON.user(rawText), {
        systemPrompt: PROMPTS.EXTRACT_CV_STRUCTURED_JSON.system,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const parsed = this.parseJSON(response, {
        name: 'Unknown',
        email: '',
        skills: [],
        experience_years: 0,
        experiences: [],
        education: [],
        projects: [],
      });

      logger.info('✅ Chain: CV extraction completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: CV extraction error:', error);
      throw error;
    }
  }
  async RoleSuggestion(extractedCv: object): Promise<any> {
    try {
      logger.info('🔗 Chain: Role Suggestion');
      const response = await openaiService.completion(PROMPTS.ROLE_SUGGESTION.user(extractedCv), {
        systemPrompt: PROMPTS.ROLE_SUGGESTION.system,
        temperature: 0.1,
      });

      const parsed = this.parseJSON(response, {
        name: 'Unknown',
        email: '',
        skills: [],
        experience_years: 0,
        experiences: [],
        education: [],
        projects: [],
      });

      logger.info('✅ Chain: CV extraction completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: CV extraction error:', error);
      throw error;
    }
  }
  async SummaryRecommendation(extractedCv: object, roleSuggestion: object, jobListed: object): Promise<any> {
    try {
      logger.info('🔗 Chain: Summary Recommendation');
      const response = await openaiService.completion(PROMPTS.SUMMARY_RECOMENDATION.user(extractedCv, roleSuggestion, jobListed), {
        systemPrompt: PROMPTS.SUMMARY_RECOMENDATION.system,
        temperature: 0.1,
      });

      const parsed = this.parseJSON(response, {
        name: 'Unknown',
        email: '',
        skills: [],
        experience_years: 0,
        experiences: [],
        education: [],
        projects: [],
      });

      logger.info('✅ Chain: CV extraction completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: CV extraction error:', error);
      throw error;
    }
  }
  async beautifyDescription(description: string): Promise<any> {
    try {
      logger.info('🔗 Chain: beautifyDescription');
      const response = await openaiService.completion(PROMPTS.BEAUTIFY_DESCRIPTION.user(description), {
        systemPrompt: PROMPTS.BEAUTIFY_DESCRIPTION.system,
        temperature: 0.1,
      });

      const parsed = this.parseJSON(response, {
        name: 'Unknown',
        email: '',
        skills: [],
        experience_years: 0,
        experiences: [],
        education: [],
        projects: [],
      });

      logger.info('✅ Chain: beautifyDescription completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: beautifyDescription error:', error);
      throw error;
    }
  }
  async calculateSkillmatch(cvSkills: any, jobRequirements: any): Promise<any> {
    try {
      logger.info('🔗 Chain: beautifyDescription');
      const response = await openaiService.completion(PROMPTS.CALCULATE_SKILL.user(cvSkills, jobRequirements), {
        systemPrompt: PROMPTS.CALCULATE_SKILL.system,
        temperature: 0.1,
      });

      const parsed = this.parseJSON(response, {
        name: 'Unknown',
        email: '',
        skills: [],
        experience_years: 0,
        experiences: [],
        education: [],
        projects: [],
      });

      logger.info('✅ Chain: beautifyDescription completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: beautifyDescription error:', error);
      throw error;
    }
  }
}

export default new LLMChainService();
