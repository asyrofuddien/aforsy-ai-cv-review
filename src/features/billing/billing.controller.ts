import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middlewares/error.middleware';
import { billingService } from './billing.service';

const parsePagination = (value: unknown, fallback: number, maximum: number): number => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new AppError(`Pagination values must be between 1 and ${maximum}.`, 400);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AppError(`Pagination values must be between 1 and ${maximum}.`, 400);
  }
  return parsed;
};

export const billingController = {
  catalog: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: await billingService.getActiveCatalog() });
  }),

  wallet: asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await billingService.getWallet(req.authUser!.userId) });
  }),

  ledger: asyncHandler(async (req: Request, res: Response) => {
    const page = parsePagination(req.query.page, 1, 10000);
    const limit = parsePagination(req.query.limit, 20, 100);
    res.json({ success: true, data: await billingService.listLedger(req.authUser!.userId, page, limit) });
  }),

  goodwill: asyncHandler(async (req: Request, res: Response) => {
    const key = req.header('Idempotency-Key');
    if (!key) throw new AppError('Idempotency-Key header is required.', 400);
    const data = await billingService.grantGoodwill({
      actorId: req.authUser!.userId,
      userId: req.params.userId,
      credits: req.body.credits,
      caseReference: req.body.caseReference,
      reason: req.body.reason,
      idempotencyKey: key,
    });
    res.status(201).json({ success: true, data });
  }),
};
