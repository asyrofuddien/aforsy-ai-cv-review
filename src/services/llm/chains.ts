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
      let cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Try to fix common JSON issues
      // 1. Remove trailing commas
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
      
      // 2. Try to find and extract valid JSON if embedded in text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      // 3. Attempt to parse
      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch (error) {
      logger.error('Failed to parse JSON response:');
      logger.error('Parse error:', error);
      
      // Try to extract partial JSON for debugging
      try {
        const truncated = text.substring(0, 500);
        logger.error('Response preview:', truncated);
      } catch (e) {
        // Ignore logging errors
      }
      
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
        name: 'Unknown Candidate',
        email: '',
        phone: '',
        location: '',
        summary: '',
        skills: [],
        work_experience: [],
        education: [],
        seniority: 'Mid-level',
      });

      // Validate critical fields
      if (!parsed.name || parsed.name === '' || parsed.name === 'Unknown Candidate') {
        logger.warn('Name field is empty in parsed CV, attempting manual extraction');
        
        // Try to extract name manually from raw text
        const extractedName = this.extractNameFromText(rawText);
        if (extractedName) {
          parsed.name = extractedName;
          logger.info(`Manually extracted name: ${extractedName}`);
        } else {
          parsed.name = 'Unknown Candidate';
          logger.warn('Could not extract name from CV text');
        }
      }

      if (!parsed.skills || parsed.skills.length === 0) {
        logger.warn('No skills extracted from CV');
        parsed.skills = [];
      }

      logger.info('✅ Chain: CV extraction completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: CV extraction error:', error);
      throw error;
    }
  }

  /**
   * Attempt to extract name from raw CV text using pattern matching
   */
  private extractNameFromText(text: string): string | null {
    // Get first 500 characters where name is most likely to be
    const topSection = text.substring(0, 500);
    
    // Split into lines
    const lines = topSection.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Pattern 1: Look for capitalized words (2-4 words) in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      
      // Skip lines that look like headers or labels
      if (line.toLowerCase().includes('resume') || 
          line.toLowerCase().includes('curriculum') ||
          line.toLowerCase().includes('cv') ||
          line.includes('@') ||
          line.includes('http') ||
          line.length > 50) {
        continue;
      }
      
      // Check if line looks like a name (2-4 capitalized words)
      const words = line.split(/\s+/);
      if (words.length >= 2 && words.length <= 4) {
        // Check if all words start with capital letter
        const allCapitalized = words.every(word => /^[A-Z]/.test(word));
        if (allCapitalized) {
          logger.info(`Found potential name in line ${i}: ${line}`);
          return line;
        }
      }
    }
    
    // Pattern 2: Look for name after common CV headers
    const namePatterns = [
      /(?:Name|Full Name|Candidate):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/m,
    ];
    
    for (const pattern of namePatterns) {
      const match = topSection.match(pattern);
      if (match && match[1]) {
        logger.info(`Found name using pattern: ${match[1]}`);
        return match[1];
      }
    }
    
    return null;
  }
  async RoleSuggestion(extractedCv: object): Promise<any> {
    try {
      logger.info('🔗 Chain: Role Suggestion');
      const response = await openaiService.completion(PROMPTS.ROLE_SUGGESTION.user(extractedCv), {
        systemPrompt: PROMPTS.ROLE_SUGGESTION.system,
        temperature: 0.1,
      });

      const parsed = this.parseJSON(response, {
        suggested_roles: ['Software Engineer', 'Backend Developer', 'Full Stack Developer'],
        seniority: 'Mid-level',
      });

      // Validate suggested_roles
      if (!parsed.suggested_roles || parsed.suggested_roles.length === 0) {
        parsed.suggested_roles = ['Software Engineer', 'Backend Developer', 'Full Stack Developer'];
        logger.warn('No roles suggested, using defaults');
      }

      // Validate seniority
      const validSeniorities = ['Entry-level', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Principal'];
      if (!parsed.seniority || !validSeniorities.includes(parsed.seniority)) {
        parsed.seniority = 'Mid-level';
        logger.warn('Invalid seniority, using default: Mid-level');
      }

      logger.info('✅ Chain: Role suggestion completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: Role suggestion error:', error);
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
        summary: {
          strengths: ['Strong technical background', 'Good problem-solving skills', 'Relevant experience'],
          improvements: ['Expand skill set', 'Gain more experience', 'Improve documentation'],
          next_steps: ['Apply to matching roles', 'Build portfolio projects', 'Network with professionals'],
        },
      });

      // Validate summary structure
      if (!parsed.summary) {
        parsed.summary = {
          strengths: ['Strong technical background', 'Good problem-solving skills', 'Relevant experience'],
          improvements: ['Expand skill set', 'Gain more experience', 'Improve documentation'],
          next_steps: ['Apply to matching roles', 'Build portfolio projects', 'Network with professionals'],
        };
        logger.warn('Summary not found, using defaults');
      }

      logger.info('✅ Chain: Summary recommendation completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: Summary recommendation error:', error);
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
        description: description.substring(0, 200) + '...', // Fallback to truncated original
      });

      // Validate description exists
      if (!parsed.description || parsed.description === '') {
        parsed.description = description.substring(0, 200) + '...';
        logger.warn('Description beautification failed, using truncated original');
      }

      logger.info('✅ Chain: beautifyDescription completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: beautifyDescription error:', error);
      return {
        description: description.substring(0, 200) + '...',
      };
    }
  }
  async calculateSkillmatch(cvSkills: any, jobRequirements: any): Promise<any> {
    try {
      logger.info('🔗 Chain: calculateSkillmatch');
      const response = await openaiService.completion(PROMPTS.CALCULATE_SKILL.user(cvSkills, jobRequirements), {
        systemPrompt: PROMPTS.CALCULATE_SKILL.system,
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

      logger.info('✅ Chain: calculateSkillmatch completed');
      return parsed;
    } catch (error) {
      logger.error('Chain: calculateSkillmatch error:', error);
      return {
        score: 0,
        explanation: 'Error calculating skill match',
      };
    }
  }
}

export default new LLMChainService();
