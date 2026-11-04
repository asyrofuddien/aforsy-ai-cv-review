import appLogger from '../../utils/logger';
import { MATCHER_PROMPTS } from './matcher.prompts';
import { AIJsonService } from '../../services/llm/json-response';
import openaiService from '../../services/llm/openai.service';


const logger = appLogger.child({ scope: 'ai-chain' });

export class MatcherAIService extends AIJsonService {
async extractCVToJSON(rawText: string): Promise<any> {
    try {
      logger.debug('🔗 Chain: Extract CV Structured JSON');

      const response = await openaiService.completion(MATCHER_PROMPTS.EXTRACT_CV_STRUCTURED_JSON.user(rawText), {
        systemPrompt: MATCHER_PROMPTS.EXTRACT_CV_STRUCTURED_JSON.system,
        temperature: 0.1, // Low temperature for consistent extraction
        maxTokens: 3500,
        stage: 'cv_extraction',
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
      }, true);

      // Validate critical fields
      if (!parsed.name || parsed.name === '' || parsed.name === 'Unknown Candidate') {
        logger.warn('Name field is empty in parsed CV, attempting manual extraction');
        
        // Try to extract name manually from raw text
        const extractedName = this.extractNameFromText(rawText);
        if (extractedName) {
          parsed.name = extractedName;
          logger.debug('Candidate name recovered from CV text');
        } else {
          parsed.name = 'Unknown Candidate';
          logger.warn('Could not extract name from CV text');
        }
      }

      if (!parsed.skills || parsed.skills.length === 0) {
        logger.warn('No skills extracted from CV');
        parsed.skills = [];
      }

      logger.debug('✅ Chain: CV extraction completed');
      return parsed;
    } catch (error) {
      logger.debug('Chain: CV extraction error:', error);
      throw error;
    }
  }

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
          logger.debug('Candidate name found', { line: i });
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
        logger.debug('Candidate name found using fallback pattern');
        return match[1];
      }
    }
    
    return null;
  }

async RoleSuggestion(extractedCv: object): Promise<any> {
    try {
      logger.debug('🔗 Chain: Role Suggestion');
      const response = await openaiService.completion(MATCHER_PROMPTS.ROLE_SUGGESTION.user(extractedCv), {
        systemPrompt: MATCHER_PROMPTS.ROLE_SUGGESTION.system,
        temperature: 0.1,
        stage: 'role_suggestion',
        maxTokens: 4000,
        rejectTruncated: true,
      });

      const parsed = this.parseJSON(response, null, true);

      // Validate suggested_roles
      if (!parsed || !Array.isArray(parsed.suggested_roles) || parsed.suggested_roles.length === 0 || parsed.suggested_roles.some((role: unknown) => typeof role !== 'string' || !role.trim())) {
        throw new Error('AI did not return valid job roles for this CV.');
      }
      parsed.suggested_roles = [...new Set(parsed.suggested_roles.map((role: string) => role.trim()))].slice(0, 3);

      // Validate seniority
      const validSeniorities = ['Entry-level', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Principal'];
      if (!parsed.seniority || !validSeniorities.includes(parsed.seniority)) {
        parsed.seniority = 'Mid-level';
        logger.warn('Invalid seniority, using default: Mid-level');
      }

      logger.debug('✅ Chain: Role suggestion completed');
      return parsed;
    } catch (error) {
      logger.debug('Chain: Role suggestion error:', error);
      throw error;
    }
  }

async SummaryRecommendation(extractedCv: object, roleSuggestion: object, jobListed: object): Promise<any> {
    try {
      logger.debug('🔗 Chain: Summary Recommendation');
      const response = await openaiService.completion(MATCHER_PROMPTS.SUMMARY_RECOMENDATION.user(extractedCv, roleSuggestion, jobListed), {
        systemPrompt: MATCHER_PROMPTS.SUMMARY_RECOMENDATION.system,
        temperature: 0.1,
        stage: 'matching_summary',
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

      logger.debug('✅ Chain: Summary recommendation completed');
      return parsed;
    } catch (error) {
      logger.debug('Chain: Summary recommendation error:', error);
      throw error;
    }
  }
}
