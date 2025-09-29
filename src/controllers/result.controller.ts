import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import Evaluation from '../models/evaluation.model';
import { ERROR_MESSAGES } from '../utils/constants';
import logger from '../utils/logger';

export class ResultController {
  getResult = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { id } = req.params;

      const evaluation = await Evaluation.findById(id);

      if (!evaluation) {
        return res.status(404).json({
          success: false,
          message: ERROR_MESSAGES.EVALUATION_NOT_FOUND,
        });
      }

      // Format response based on status
      if (evaluation.status === 'completed' && evaluation.result) {
        res.status(200).json({
          id: evaluation.id,
          status: evaluation.status,
          result: {
            cv_match_rate: evaluation.result.cvMatchRate,
            cv_feedback: evaluation.result.cvFeedback,
            project_score: evaluation.result.projectScore,
            project_feedback: evaluation.result.projectFeedback,
            overall_summary: evaluation.result.overallSummary,
            result: evaluation.result.recommendation
          },
        });
      } else {
        res.status(200).json({
          id: evaluation.id,
          status: evaluation.status,
        });
      }
    }
  );
}

export default new ResultController();
