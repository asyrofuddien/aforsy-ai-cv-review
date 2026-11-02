import Document from '../../models/document.model';
import { ProjectAIService } from '../../features/project-evaluation/project.ai';
import vectordbService from '../vectordb/vectordb.service';
import appLogger from '../../utils/logger';

const logger = appLogger.child({ scope: 'project-review' });
const projectAI = new ProjectAIService();

export class ProjectEvaluator {
  async evaluate(projectDocumentId: string) {
    try {
      logger.debug('📁 Project Evaluator: Starting evaluation');

      // Get project document
      const projectDoc = await Document.findById(projectDocumentId);
      if (!projectDoc) throw new Error('Project document not found');

      // Get scoring rubric from vector DB
      const rubricContext = await vectordbService.search(
        'project scoring rubric technical evaluation',
        3,
        { type: 'scoring_rubric' }
      );

      // Default rubric if none found
      const rubric =
        rubricContext.length > 0
          ? rubricContext[0].metadata
          : this.getDefaultRubric();

      // Evaluate project
      const evaluation = await projectAI.evaluateProject(
        projectDoc.content || '',
        rubric
      );

      return {
        evaluation,
        score: evaluation.score || 5.0,
      };
    } catch (error) {
      logger.debug('Project evaluation error:', error);
      throw error;
    }
  }

  private getDefaultRubric() {
    return {
      criteria: {
        correctness: 'Meets all functional requirements',
        code_quality: 'Clean, modular, follows best practices',
        resilience: 'Handles errors, implements retry logic',
        documentation: 'Clear README, code comments',
        creativity: 'Bonus features, innovative solutions',
      },
      scoring: 'Each criterion scored 1-5, total converted to 0-10',
    };
  }
}

export default new ProjectEvaluator();
