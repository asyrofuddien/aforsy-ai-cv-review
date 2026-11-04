import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middlewares/error.middleware';
import { AiOperation, AiOperationResult, CreditReservation } from '../../models/billing.models';

const safeOperation = (op: any, reservation?: any) => ({
  id: String(op._id), action: op.action, status: op.status, locale: op.locale,
  billing: { status: reservation?.status || 'unknown', credits: reservation?.totalCredits ?? 0 },
  failureCode: op.failureCode, createdAt: op.createdAt, completedAt: op.completedAt,
  resultAvailable: Boolean(op.resultId),
});

export const listOperations = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.authUser!.userId;
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '20'), 10) || 20));
  const [ops, total] = await Promise.all([
    AiOperation.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('-inputSnapshot').lean(),
    AiOperation.countDocuments({ userId }),
  ]);
  const reservations = await CreditReservation.find({ referenceId: { $in: ops.map(op => op._id) } })
    .select('referenceId status totalCredits').lean();
  const byOperation = new Map(reservations.map(item => [String(item.referenceId), item]));
  res.json({ success: true, data: ops.map(op => safeOperation(op, byOperation.get(String(op._id)))), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

export const getOperation = asyncHandler(async (req: Request, res: Response) => {
  const op = await AiOperation.findById(req.params.id).select('-inputSnapshot').lean();
  if (!op) throw new AppError('AI operation not found.', 404);
  if (String(op.userId) !== req.authUser!.userId) throw new AppError('You do not have access to this operation.', 403);
  const reservation = await CreditReservation.findOne({ referenceId: op._id }).select('status totalCredits').lean();
  res.json({ success: true, data: safeOperation(op, reservation) });
});

export const getOperationResult = asyncHandler(async (req: Request, res: Response) => {
  const op = await AiOperation.findById(req.params.id).select('userId resultId status').lean();
  if (!op) throw new AppError('AI operation not found.', 404);
  if (String(op.userId) !== req.authUser!.userId) throw new AppError('You do not have access to this operation.', 403);
  if (!op.resultId) throw new AppError('Operation result is not ready.', 404);
  const result: any = await AiOperationResult.findOne({ _id: op.resultId, operationId: op._id, userId: req.authUser!.userId })
    .select('+resultData').lean();
  if (!result || result.state === 'expired' || result.state === 'deleted') throw new AppError('Operation result is no longer available.', 404);
  res.json({ success: true, data: { operationId: String(op._id), state: result.state, source: result.source, result: result.resultData, expiresAt: result.expiresAt } });
});
