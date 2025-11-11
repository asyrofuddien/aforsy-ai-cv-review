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

class EvaluationService {
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
      const file = {
        path: cvDocument.path,
        mimetype: cvDocument.mimeType,
        filename: cvDocument.filename,
      };

      logger.info('📄 Step 2: Extracting Raw Text from CV');
      const rawText = await parserService.parseFile(file.path, file.mimetype);

      logger.info('📄 Step 3: Extract CV Structured JSON');
      const extractedCv = await chainService.extractCVToJSON(rawText);

      await cvMatcherModel.findByIdAndUpdate(cvMatcherId, {
        'result.user_profile.name': extractedCv?.name,
      });

      logger.info('📄 Step 4: Role Suggestion');
      const roleSuggestion = await chainService.RoleSuggestion(extractedCv);

      logger.info('📄 Step 5: Scrape Job Listings');
      const jobListed = await scrapingService.FindJobs(roleSuggestion);

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

      await Evaluation.findByIdAndUpdate(data.evaluationId, {
        status: 'failed',
        error: message,
      });

      throw error;
    }
  }
}

export default new EvaluationService();
