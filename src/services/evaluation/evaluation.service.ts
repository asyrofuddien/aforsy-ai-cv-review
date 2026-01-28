// services/evaluation/evaluation.service.ts
import { Job } from 'bullmq';
import Evaluation from '../../models/evaluation.model';
import cvMatcherModel from '../../models/cvMatcher.model';
import JobDescription from '../../models/jobDescription.model';
import documentModel from '../../models/document.model';
import cvEvaluator from './cv.evaluator';
import chainService from '../llm/chains';
import logger from '../../utils/logger';
import parserService from '../parser.service';
import scrapingService from '../scraping.service';
import { JobListing } from '@/types/evaluation.types';

interface ScrapeJobsParams {
  roleSuggestion: string[];
  seniority?: string;
  location: string;
}

interface ApiResponse {
  success: boolean;
  message: string;
  data?: {
    jobs: JobListing[];
    meta: {
      total_jobs: number;
      keywords_searched: string[];
      seniority_level: string;
      location: string;
      scraping_duration: string;
      scraped_at: string;
    };
  };
}

class EvaluationService {
  /**
   * Private method untuk scrape jobs dari API
   */
  private async scrapeJobsFromAPI(params: ScrapeJobsParams): Promise<JobListing[]> {
    try {
      logger.info(`🌐 Calling scrape API with params:`, {
        job_suggestions: params.roleSuggestion,
        seniority: params.seniority || 'Mid',
        location: params.location,
      });

      const response = await fetch('http://localhost:9092/api/scrape-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_suggestions: params.roleSuggestion,
          seniority: params.seniority || 'Mid',
          location: 'Indonesia',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = (await response.json()) as ApiResponse;

      if (!data.success) {
        throw new Error(data.message || 'API returned error');
      }

      const jobs = data.data?.jobs || [];
      logger.info(`✅ Successfully fetched ${jobs.length} jobs from API`);

      return jobs;
    } catch (error) {
      logger.error('❌ Error calling scrape API:', error);
      throw error;
    }
  }

  /**
   * Private method untuk get jobs dengan fallback ke dummy data
   */
  private async getJobListings(roleSuggestion: string[], seniority?: string): Promise<JobListing[]> {
    let jobListed: JobListing[] = [];

    try {
      // Try to scrape from API first
      jobListed = await this.scrapeJobsFromAPI({
        roleSuggestion,
        seniority: seniority || 'Mid',
        location: 'indonesia',
      });

      // If no jobs found, use dummy data
      if (jobListed.length === 0) {
        logger.warn('No jobs found from scraping, using dummy data');
        jobListed = await scrapingService.FindJobs({
          suggested_roles: roleSuggestion,
          seniority: seniority || 'Mid-level',
        });
      }
    } catch (error) {
      logger.error('Error scraping jobs, using dummy data:', error);
      // Fallback to dummy data on error
      jobListed = await scrapingService.FindJobs({
        suggested_roles: roleSuggestion,
        seniority: seniority || 'Mid-level',
      });
    }

    return jobListed;
  }

  async processEvaluation(data: any): Promise<any> {
    const { evaluationId, cvDocumentId, projectDocumentId, jobDescriptionId } = data;

    try {
      logger.info(`🚀 Starting evaluation ${evaluationId}`);

      // Update status to processing
      await Evaluation.findByIdAndUpdate(evaluationId, {
        status: 'processing',
      });

      // Get job description for weights info
      const jobDesc = await JobDescription.findById(jobDescriptionId);
      if (!jobDesc) throw new Error('Job description not found');

      // Step 1: Evaluate CV
      logger.info('📄 Step 1: Evaluating CV with weights:', jobDesc.scoringWeights);
      const cvResult = await cvEvaluator.evaluate(cvDocumentId, jobDescriptionId);

      // Step 3: Generate final summary
      logger.info('📝 Step 3: Generating final summary');
      const overallSummary = await chainService.generateFinalSummary(cvResult.evaluation);

      const summary = overallSummary?.overall_summary;
      const recommendation = overallSummary?.recommendation;

      // Compile final result dengan info weights yang digunakan
      const finalResult = {
        cvMatchRate: cvResult.matchRate,
        cvFeedback: cvResult.evaluation.feedback,
        overallSummary: summary,
        recommendation,
        detailedScores: {
          ...cvResult.evaluation.scores,
        },
        scoringWeightsUsed: jobDesc.scoringWeights,
      };

      // Update evaluation with result
      await Evaluation.findByIdAndUpdate(evaluationId, {
        status: 'completed',
        result: finalResult,
      });

      logger.info(`✅ Evaluation ${evaluationId} completed successfully`);
      return finalResult;
    } catch (error) {
      let message = 'Unknown error';
      if (error instanceof Error) {
        message = error.message;
      }

      await Evaluation.findByIdAndUpdate(data.evaluationId, {
        status: 'failed',
        error: message,
      });

      throw error;
    }
  }

  async processCvMatcher(data: any): Promise<any> {
    const { cvMatcherId, cvDocumentId } = data;

    try {
      logger.info(`🚀 Starting cv-matcher ${cvMatcherId}`);

      // Update status to processing
      await cvMatcherModel.findByIdAndUpdate(cvMatcherId, {
        status: 'processing',
      });

      logger.info('📄 Step 1: Fetching CV Document');
      const cvDocument = await documentModel.findById(cvDocumentId);

      if (!cvDocument) {
        throw new Error(`CV Document not found with ID: ${cvDocumentId}`);
      }

      logger.info(`📄 CV Document found: ${cvDocument.filename} at ${cvDocument.path}`);

      const file = {
        path: cvDocument.path,
        mimetype: cvDocument.mimeType,
        filename: cvDocument.filename,
      };

      logger.info('📄 Step 2: Extracting Raw Text from CV');
      let rawText: string;

      try {
        rawText = await parserService.parseFile(file.path, file.mimetype);
      } catch (parseError: any) {
        logger.error(`Failed to parse CV file: ${parseError.message}`);

        // If file not found, check if we have cached content
        if (cvDocument.content) {
          logger.info('Using cached content from database');
          rawText = cvDocument.content;
        } else {
          throw new Error(`Failed to parse CV file and no cached content available: ${parseError.message}`);
        }
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('CV file is empty or contains no readable text');
      }

      logger.info(`📄 Extracted ${rawText.length} characters from CV`);

      logger.info('📄 Step 3: Extract CV Structured JSON');
      const extractedCv = await chainService.extractCVToJSON(rawText);

      // Ensure name is extracted, fallback to filename if not found
      if (!extractedCv?.name || extractedCv.name === '' || extractedCv.name === 'Unknown Candidate') {
        // Try to extract name from filename or use a placeholder
        const filenameParts = cvDocument.filename.split('.');
        const possibleName = filenameParts[0].replace(/[-_]/g, ' ').trim();
        extractedCv.name = possibleName || 'Candidate';
        logger.warn(`Name not found in CV, using fallback: ${extractedCv.name}`);
      }

      await cvMatcherModel.findByIdAndUpdate(cvMatcherId, {
        'result.user_profile.name': extractedCv?.name,
      });

      logger.info('📄 Step 4: Role Suggestion');
      const roleSuggestion = await chainService.RoleSuggestion(extractedCv);

      logger.info('📄 Step 5: Scrape Job Listings');
      const jobListed = await this.getJobListings(roleSuggestion.suggested_roles, roleSuggestion.seniority);

      logger.info('🔍 Step 6: Matching with available jobs');
      const jobMatches = await scrapingService.matchWithJobs(extractedCv, jobListed);

      logger.info('📄 Step 7: Summary Recommendation');
      const summaryRecommendation = await chainService.SummaryRecommendation(extractedCv, roleSuggestion, jobListed);

      const summary = summaryRecommendation.summary;
      logger.info('📄 Step 8: Final Result');

      const finalResult = {
        user_profile: {
          name: extractedCv?.name,
          seniority: roleSuggestion?.seniority,
          primary_skills: extractedCv?.skills,
        },
        suggested_roles: roleSuggestion?.suggested_roles,
        jobs: jobMatches,
        summary,
      };

      // Update evaluation with result
      await cvMatcherModel.findByIdAndUpdate(cvMatcherId, {
        status: 'completed',
        result: finalResult,
      });

      logger.info(`✅ CV-Matcher ${cvMatcherId} completed successfully`);
      return finalResult;
    } catch (error) {
      let message = 'Unknown error';
      if (error instanceof Error) {
        message = error.message;
      }

      logger.error(`❌ CV-Matcher ${cvMatcherId} failed:`, message);

      await cvMatcherModel.findByIdAndUpdate(cvMatcherId, {
        status: 'failed',
        error: message,
      });

      throw error;
    }
  }

  /**
   * Public method untuk testing scraping functionality
   */
  async testJobScraping(jobSuggestions: string[], seniority?: string, location = 'indonesia'): Promise<JobListing[]> {
    try {
      logger.info('🧪 Testing job scraping functionality');

      const jobs = await this.scrapeJobsFromAPI({
        roleSuggestion: jobSuggestions,
        seniority,
        location,
      });

      logger.info(`✅ Test completed: Found ${jobs.length} jobs`);
      return jobs;
    } catch (error) {
      logger.error('❌ Test failed:', error);
      throw error;
    }
  }
}

export default new EvaluationService();
