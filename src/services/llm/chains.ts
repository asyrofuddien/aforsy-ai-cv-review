import { Locale } from '../../utils/locale';
import { CVExtractedInfo } from '../../types/evaluation.types';
import { ReviewAIService } from '../../features/review/review.ai';
import { MatcherAIService } from '../../features/cv-matcher/matcher.ai';
import { JobsAIService } from '../../features/jobs/jobs.ai';
import { ProjectAIService } from '../../features/project-evaluation/project.ai';

/** @deprecated Import the feature-owned AI service directly. */
export class LLMChainService {
  private readonly review = new ReviewAIService();
  private readonly matcher = new MatcherAIService();
  private readonly jobs = new JobsAIService();
  private readonly project = new ProjectAIService();

  extractCVInfo(cvContent: string): Promise<CVExtractedInfo> {
    return this.review.extractCVInfo(cvContent);
  }
  evaluateCV(
    cvInfo: CVExtractedInfo & { sourceText?: string },
    jobRequirements: any,
  ): Promise<any> {
    return this.review.evaluateCV(cvInfo, jobRequirements);
  }
  evaluateProject(projectContent: string, rubric: any): Promise<any> {
    return this.project.evaluateProject(projectContent, rubric);
  }
  generateFinalSummary(
    cvEval: any,
    mode: 'general' | 'job_specific' = 'job_specific',
    locale: Locale = 'en',
  ) {
    return this.review.generateFinalSummary(cvEval, mode, locale);
  }
  extractCVToJSON(rawText: string): Promise<any> {
    return this.matcher.extractCVToJSON(rawText);
  }
  RoleSuggestion(extractedCv: object): Promise<any> {
    return this.matcher.RoleSuggestion(extractedCv);
  }
  SummaryRecommendation(
    extractedCv: object,
    roleSuggestion: object,
    jobListed: object,
  ): Promise<any> {
    return this.matcher.SummaryRecommendation(extractedCv, roleSuggestion, jobListed);
  }
  beautifyDescription(description: string): Promise<any> {
    return this.jobs.beautifyDescription(description);
  }
  calculateSkillmatch(cvSkills: any, jobRequirements: any): Promise<any> {
    return this.jobs.calculateSkillmatch(cvSkills, jobRequirements);
  }
}

export default new LLMChainService();
