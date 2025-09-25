// services/evaluation/evaluation.service.ts
import { Job } from 'bullmq';
import Evaluation from '../../models/evaluation.model';
import JobDescription from '../../models/jobDescription.model';
import cvEvaluator from './cv.evaluator';
import projectEvaluator from './project.evaluator';
import chainService from '../llm/chains';
import logger from '../../utils/logger';

class EvaluationService {
  async processEvaluation(data: any): Promise<any> {
    const { evaluationId, cvDocumentId, projectDocumentId, jobDescriptionId } =
      data;

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
      const cvResult = await cvEvaluator.evaluate(
        cvDocumentId,
        jobDescriptionId
      );

      // Step 2: Evaluate Project
      logger.info('📁 Step 2: Evaluating project');
      const projectResult = await projectEvaluator.evaluate(projectDocumentId);

      // Step 3: Generate final summary
      logger.info('📝 Step 3: Generating final summary');
      const overallSummary = await chainService.generateFinalSummary(
        cvResult.evaluation,
        projectResult.evaluation
      );

      // Compile final result dengan info weights yang digunakan
      const finalResult = {
        cvMatchRate: cvResult.matchRate,
        cvFeedback: cvResult.evaluation.feedback,
        projectScore: projectResult.score,
        projectFeedback: projectResult.evaluation.feedback,
        overallSummary,
        detailedScores: {
          ...cvResult.evaluation.scores,
          ...projectResult.evaluation.scores,
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
}

export default new EvaluationService();