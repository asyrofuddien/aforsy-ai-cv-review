import Document from '../../models/document.model';
import JobDescription from '../../models/jobDescription.model';
import chainService from '../llm/chains';
import vectordbService from '../vectordb/vectordb.service';
import logger from '../../utils/logger';

export class CVEvaluator {
  async evaluate(cvDocumentId: string, jobDescriptionId: string) {
    try {
      logger.info('📄 CV Evaluator: Starting evaluation');

      // Get CV document
      const cvDoc = await Document.findById(cvDocumentId);
      if (!cvDoc) throw new Error('CV document not found');

      // Get job description
      const jobDesc = await JobDescription.findById(jobDescriptionId);
      if (!jobDesc) throw new Error('Job description not found');

      // Extract CV information
      const cvInfo = await chainService.extractCVInfo(cvDoc.content || '');

      // Get relevant context from vector DB
      const relevantContext = await vectordbService.search(
        `job requirements ${jobDesc.title}`,
        3,
        { type: 'job_description' }
      );

      // Evaluate CV
      const evaluation = await chainService.evaluateCV(cvInfo, {
        title: jobDesc.title,
        requirements: jobDesc.requirements,
        context: relevantContext,
      });

      return {
        extractedInfo: cvInfo,
        evaluation,
        matchRate: evaluation.match_rate || 0.5,
      };
    } catch (error) {
      logger.error('CV evaluation error:', error);
      throw error;
    }
  }
}

export default new CVEvaluator();
