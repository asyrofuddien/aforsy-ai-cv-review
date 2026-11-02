// services/evaluation/cv.evaluator.ts
import Document from '../../models/document.model';
import JobDescription from '../../models/jobDescription.model';
import chainService from '../llm/chains';
import appLogger from '../../utils/logger';

const logger = appLogger.child({ scope: 'cv-review' });

export class CVEvaluator {
  async evaluate(cvDocumentId: string, jobDescriptionId?: string, jobDescriptionText?: string) {
    try {
      logger.debug('📄 CV Evaluator: Starting evaluation');

      // Get CV document
      const cvDoc = await Document.findById(cvDocumentId);
      if (!cvDoc) throw new Error('CV document not found');

      // Get job description
      const jobDesc = jobDescriptionId ? await JobDescription.findById(jobDescriptionId) : null;
      if (jobDescriptionId && !jobDesc) throw new Error('Job description not found');

      // Extract CV information
      if (!cvDoc.content?.trim()) throw new Error('CV contains no readable text. Upload a text-based PDF, DOCX or TXT.');
      const cvInfo = await chainService.extractCVInfo(cvDoc.content);

      // Get relevant context from vector DB
      const relevantContext: unknown[] = [];

      // Evaluate CV
      const evaluation = await chainService.evaluateCV({ ...cvInfo, sourceText: cvDoc.content }, {
        mode: jobDesc || jobDescriptionText ? 'job_specific' : 'general',
        title: jobDesc?.title,
        company: jobDesc?.company,
        description: jobDescriptionText || jobDesc?.description,
        requirements: jobDesc?.requirements,
        context: relevantContext,
        scoringWeigths: jobDesc?.scoringWeights,
      });

      // Calculate weighted score using real weights from job description
      if (!Array.isArray(evaluation.criteria) || evaluation.criteria.length < 6 ||
          evaluation.criteria.some((item: any) => !item || typeof item.name !== 'string' ||
            typeof item.score !== 'number' || !Number.isFinite(item.score) || item.score < 0 || item.score > 5 ||
            typeof item.evidence !== 'string' || typeof item.suggestion !== 'string')) {
        throw new Error('AI returned an incomplete review. Please retry.');
      }
      const weightedScore = Math.round(evaluation.criteria.reduce((sum: number, item: any) => sum + item.score, 0) / evaluation.criteria.length * 20);

      // Generate detailed feedback
      const detailedFeedback = { strengths: evaluation.strengths || [], improvements: evaluation.gaps || [], recommendations: [] };

      return {
        extractedInfo: cvInfo,
        evaluation: {
          ...evaluation,
          ...detailedFeedback,
        },
        matchRate: weightedScore,
      };
    } catch (error) {
      logger.debug('CV evaluation error:', error);
      throw error;
    }
  }
}

export default new CVEvaluator();
