import appLogger from '../../utils/logger';
import { outputLanguage, Locale } from '../../utils/locale';
import { CVExtractedInfo } from '../../types/evaluation.types';
import { REVIEW_PROMPTS } from './review.prompts';
import { AIJsonService } from '../../services/llm/json-response';
import openaiService from '../../services/llm/openai.service';
import { ReviewAnalysis, validateReviewAnalysis } from './review.validation';


const logger = appLogger.child({ scope: 'ai-chain' });

export class ReviewAIService extends AIJsonService {
async extractCVInfo(cvContent: string): Promise<CVExtractedInfo> {
    try {
      logger.debug('🔗 Chain: Extracting CV information');

      const response = await openaiService.completion(REVIEW_PROMPTS.CV_EXTRACTION.user(cvContent), {
        systemPrompt: REVIEW_PROMPTS.CV_EXTRACTION.system,
        temperature: 0.1, // Low temperature for consistent extraction
        maxTokens: 6000,
        stage: 'cv_extraction',
      });

      const parsed = this.parseJSON(response, {
        name: 'Unknown',
        email: '',
        skills: [],
        experience_years: 0,
        experiences: [],
        education: [],
        projects: [],
      }, true);

      logger.debug('✅ Chain: CV extraction completed');
      return parsed;
    } catch (error) {
      logger.debug('Chain: CV extraction error:', error);
      throw error;
    }
  }

async evaluateCV(cvInfo: CVExtractedInfo & { sourceText?: string }, jobRequirements: any): Promise<ReviewAnalysis> {
    try {
      logger.debug(`🔗 Chain: Evaluating CV in ${jobRequirements.mode || 'job_specific'} mode`);

      const source = cvInfo.sourceText || '';
      if (!source.trim()) throw new Error('CV contains no readable text.');
      const jobSource = jobRequirements.mode === 'job_specific'
        ? [jobRequirements.title, jobRequirements.description, jobRequirements.requirements ? JSON.stringify(jobRequirements.requirements) : ''].filter(Boolean).join('\n')
        : '';
      const prompt = REVIEW_PROMPTS.CV_EVALUATION.user(source, jobSource, jobRequirements.mode);
      for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await openaiService.completion(prompt + (attempt > 1
          ? '\nYour previous response failed validation. Rebuild the complete JSON from the original sources. Include exactly six unique criterion IDs and every required field. Copy evidence verbatim; do not paraphrase quotes. Use empty evidence only with not_visible/not_assessable. Keep requirementMatches empty in general mode.'
          : ''), {
          systemPrompt: REVIEW_PROMPTS.CV_EVALUATION.system + ` Write all human-readable text in ${outputLanguage(jobRequirements.locale === 'id' ? 'id' : 'en')}, except exact source quotes. Keep IDs, JSON keys and enums unchanged.`,
          temperature: 0.1,
          maxTokens: 8000,
          stage: 'cv_evaluation',
        });
        try {
          const parsed = validateReviewAnalysis(this.parseJSON(response, null, true), source, jobSource);
          logger.debug('Chain: CV evaluation completed');
          return parsed;
        } catch (error) {
          logger.warn('Review output failed validation', { attempt, willRetry: attempt < 2 });
          if (attempt === 2) throw error;
        }
      }
      throw new Error('AI returned an incomplete review. Please retry.');
    } catch (error) {
      logger.debug('Chain: CV evaluation error:', error);
      throw error;
    }
  }

async generateFinalSummary(cvEval: any, mode: 'general' | 'job_specific' = 'job_specific', locale: Locale = 'en') {
    try {
      logger.debug('🔗 Chain: Generating final summary');

      const response = await openaiService.completion(REVIEW_PROMPTS.FINAL_SUMMARY.user(cvEval, mode), {
        systemPrompt: (mode === 'general' ? 'You summarize CV document quality neutrally. Never provide hiring recommendations or job-fit judgments.' : REVIEW_PROMPTS.FINAL_SUMMARY.system) + ` Write all human-readable summaries and missing information in ${outputLanguage(locale)}. Keep JSON keys and recommendation enum values unchanged.`,
        temperature: 0.4,
        maxTokens: 1000,
        stage: 'review_summary',
      });

      const parsed = this.parseJSON(response, {
        match_rate: 0.5,
        strengths: [],
        gaps: [],
        feedback: 'Unable to evaluate',
        scores: {},
      }, true);

      logger.debug('✅ Chain: Final summary generated');
      return parsed;
    } catch (error) {
      logger.debug('Chain: Final summary error:', error);
      throw error;
    }
  }
}
