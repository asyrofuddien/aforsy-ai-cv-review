import { createHash } from 'crypto';
import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middlewares/error.middleware';
import Evaluation from '../../models/evaluation.model';
import Document from '../../models/document.model';
import { operationService } from '../ai-operations/operation.service';

export const retryJobMatching = asyncHandler(async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Invalid review ID.', 400);
  const userId = req.authUser!.userId;
  const evaluation = await Evaluation.findOne({ _id: req.params.id, userId }).select('+matchingProfile');
  if (!evaluation) throw new AppError('Review not found.', 404);
  if (evaluation.status !== 'completed' || !evaluation.result) throw new AppError('Your CV review is not ready.', 409);
  // Terminal replays still pass through createAndReserve to return their original
  // operation; eligibility and the single-active-retry claim are checked atomically there.
  if (!evaluation.matchingProfile && !(await Document.exists({ _id: evaluation.cvDocumentId, userId, content: { $type: 'string', $ne: '' } }))) {
    throw new AppError('The CV source for job matching is no longer available.', 410);
  }
  const locale = evaluation.locale === 'id' ? 'id' : 'en';
  const snapshot = { evaluationId: evaluation.id };
  const fingerprint = createHash('sha256').update(JSON.stringify({ action: 'job_match_retry', ...snapshot, locale })).digest('hex');
  const created = await operationService.createAndReserve({
    userId, action: 'job_match_retry', locale, inputSnapshot: snapshot,
    inputSnapshotRef: `evaluation:${evaluation.id}`, inputFingerprint: fingerprint,
    idempotencyKey: String(req.header('Idempotency-Key') || ''),
  });
  res.status(202).json({ operationId: String(created.operation._id), status: created.operation.status, billing: created.billing, wallet: created.wallet });
});
