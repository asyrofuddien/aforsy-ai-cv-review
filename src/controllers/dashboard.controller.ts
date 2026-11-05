import { Request, Response } from 'express';
import Document from '../models/document.model';
import Evaluation from '../models/evaluation.model';
import CvMatcher from '../models/cvMatcher.model';
import AtsPdf from '../models/atsPDF.model';
import { asyncHandler } from '../middlewares/error.middleware';

export const dashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const ownerFilter = req.authUser!.role === 'admin' ? {} : { userId: req.authUser!.userId };
  const [documents, evaluations, matches, generatedCvs] = await Promise.all([
    Document.countDocuments(ownerFilter),
    Evaluation.aggregate([
      { $match: ownerFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CvMatcher.countDocuments(ownerFilter),
    AtsPdf.countDocuments(ownerFilter),
  ]);
  const evaluationCounts = evaluations.reduce<Record<string, number>>((counts, row) => {
    counts[row._id] = row.count;
    return counts;
  }, {});
  res.json({
    success: true,
    data: { documents, evaluations: evaluationCounts, cvMatches: matches, generatedCvs },
  });
});
