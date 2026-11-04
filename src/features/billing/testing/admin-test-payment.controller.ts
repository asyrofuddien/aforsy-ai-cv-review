import { Request, Response } from 'express';
import { asyncHandler } from '../../../middlewares/error.middleware';
import { markTestPaymentPaid } from './admin-test-payment.service';

export const markAdminTestPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = await markTestPaymentPaid(req.params.id, req.authUser!.userId, req.body.reason);
  res.json({ success: true, data });
});
