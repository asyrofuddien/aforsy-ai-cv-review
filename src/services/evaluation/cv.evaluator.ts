// services/evaluation/cv.evaluator.ts
import Document from '../../models/document.model';
import JobDescription from '../../models/jobDescription.model';
import chainService from '../llm/chains';
import vectordbService from '../vectordb/vectordb.service';
import scoringService from './scoring.service';
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

      const scoringGuide = {
        "technicalSkillsMatch": {
          "description": "Alignment with job requirements (backend, databases, APIs, cloud, AI/LLM)",
          "scoring": {
            "1": "Irrelevant skills",
            "2": "Few overlaps",
            "3": "Partial match",
            "4": "Strong match",
            "5": "Excellent match + AI/LLM exposure"
          }
        },
        "experienceLevel": {
          "description": "Years of experience and project complexity",
          "scoring": {
            "1": "<1 yr / trivial projects",
            "2": "1-2 yrs",
            "3": "3-4 yrs with mid-size projects",
            "4": "5-6 yrs solid track record",
            "5": "6+ yrs / high-impact projects"
          }
        },
        "relevantAchievements": {
          "description": "Impact of past work (scaling, performance, adoption)",
          "scoring": {
            "1": "No clear achievements",
            "2": "Minimal improvements",
            "3": "Some measurable outcomes",
            "4": "Significant contributions",
            "5": "Major measurable impact"
          }
        },
        "culturalFit": {
          "description": "Communication, learning mindset, teamwork/leadership",
          "scoring": {
            "1": "Not demonstrated",
            "2": "Minimal",
            "3": "Average",
            "4": "Good",
            "5": "Excellent and well-demonstrated"
          }
        }
      }

      // Evaluate CV
      const evaluation = await chainService.evaluateCV(cvInfo, {
        title: jobDesc.title,
        requirements: jobDesc.requirements,
        ScoringGuide: scoringGuide,
        context: relevantContext,
      });

      // Calculate weighted score using real weights from job description
      const weightedScore = scoringService.calculateOverallCVScore(
        evaluation.scores,
        jobDesc.scoringWeights
      );

      // Generate detailed feedback
      const detailedFeedback = scoringService.generateDetailedFeedback(
        evaluation.scores
      );

      return {
        extractedInfo: cvInfo,
        evaluation: {
          ...evaluation,
          ...detailedFeedback,
        },
        matchRate: weightedScore,
      };
    } catch (error) {
      logger.error('CV evaluation error:', error);
      throw error;
    }
  }
}

export default new CVEvaluator();