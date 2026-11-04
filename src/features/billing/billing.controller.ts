import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middlewares/error.middleware';
import { billingService } from './billing.service';
import { orderService } from './orders/order.service';
import { PaymentOrder, RefundRequest, CreditLot, CreditReservation, BillingWallet, CreditLedger, OutboxEvent, AiOperation, WebhookInbox } from '../../models/billing.models';
import User from '../../models/user.model';
import AdminAuditLog from '../../models/adminAuditLog.model';
import mongoose from 'mongoose';
import { requestLocale } from '../../utils/locale';
import AiUsage from '../../models/aiUsage.model';
import Evaluation from '../../models/evaluation.model';

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

  purchaseIntent: asyncHandler(async (req: Request, res: Response) => {
    const key = req.header('Idempotency-Key');
    if (!key) throw new AppError('Idempotency-Key header is required.', 400);
    const data = await orderService.createPurchaseIntent({ userId: req.authUser!.userId, sku: req.body.sku, termsVersion: req.body.termsVersion, idempotencyKey: key, locale: requestLocale(req) });
    res.status(201).json({ success: true, data });
  }),

  payments: asyncHandler(async (req: Request, res: Response) => {
    const page = parsePagination(req.query.page, 1, 10000), limit = parsePagination(req.query.limit, 20, 100);
    const filter = { userId: req.authUser!.userId };
    const [records, total] = await Promise.all([PaymentOrder.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-checkoutReference -idempotencyKey -requestFingerprint -webhookFingerprint').lean(), PaymentOrder.countDocuments(filter)]);
    res.json({ success: true, data: { records, total, page, limit, totalPages: Math.ceil(total / limit) } });
  }),

  paymentDetail: asyncHandler(async (req: Request, res: Response) => {
    const order = await PaymentOrder.findOne({ _id: req.params.id, userId: req.authUser!.userId }).select('-checkoutReference -idempotencyKey -requestFingerprint -webhookFingerprint').lean();
    if (!order) throw new AppError('Payment not found.', 404);
    res.json({ success: true, data: order });
  }),

  paymentReceipt: asyncHandler(async (req: Request, res: Response) => {
    const order = await PaymentOrder.findOne({ _id: req.params.id, userId: req.authUser!.userId }).select('publicOrderNumber packageSnapshot termsVersion provider paymentStatus fulfillmentStatus confirmedPaidAmountIdr paidAt creditGrantedAt createdAt buyerEmail').lean();
    if (!order) throw new AppError('Payment not found.', 404);
    res.json({ success: true, data: order });
  }),

  claimPayment: asyncHandler(async (req: Request, res: Response) => {
    const reference = typeof req.body.reference === 'string' ? req.body.reference.trim() : '';
    const user = await User.findOne({ _id: req.authUser!.userId, isActive: true, isEmailVerified: true }).select('email');
    let claimed = false;
    if (!reference || !user) {
      if (req.authUser?.userId) await AdminAuditLog.create({ actorUserId: req.authUser.userId, action: 'billing.payment.claim_attempt', targetType: 'payment_order', targetId: 'unresolved', details: { claimed: false, resultCode: 'invalid_request' } });
      throw new AppError('Verified account and payment reference are required.', 400);
    }
    let order: any;
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      order = await PaymentOrder.findOneAndUpdate({ publicOrderNumber: reference, buyerEmail: user.email.toLowerCase(), userId: null, paymentStatus: 'paid', fulfillmentStatus: 'pending' }, { $set: { userId: user._id, fulfillmentStatus: 'granted', creditGrantedAt: new Date() } }, { new: true, session });
      if (order) {
        const pkg = order.packageSnapshot as any;
        await billingService.grantPurchaseInTransaction({ userId: user._id, amount: pkg.credits, sourceId: String(order._id), grantKey: `grant:order:${order._id}`, session });
        await OutboxEvent.updateOne({ eventKey: `email.purchase_receipt:${order._id}` }, { $setOnInsert: { eventKey: `email.purchase_receipt:${order._id}`, type: 'email.purchase_receipt', entityId: order._id, payload: { orderId: String(order._id) }, state: 'pending', attempts: 0, nextAttemptAt: new Date() } }, { upsert: true, session });
        claimed = true;
      }
      await AdminAuditLog.create([{ actorUserId: user._id, action: 'billing.payment.claim_attempt', targetType: 'payment_order', targetId: order ? String(order._id) : 'unresolved', details: { claimed, resultCode: claimed ? 'claimed' : 'not_claimable' } }], { session });
    }); } finally { await session.endSession(); }
    if (!claimed) throw new AppError('Payment cannot be claimed with this account and reference.', 404);
    res.json({ success: true, data: { paymentId: String(order!._id), claimed: true } });
  }),

  adminPayments: asyncHandler(async (req: Request, res: Response) => {
    const page = parsePagination(req.query.page, 1, 10000), limit = parsePagination(req.query.limit, 50, 100);
    const filter: Record<string, unknown> = {};
    if (typeof req.query.status === 'string') filter.paymentStatus = req.query.status;
    const [records, total] = await Promise.all([PaymentOrder.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-checkoutReference -idempotencyKey -requestFingerprint -webhookFingerprint').lean(), PaymentOrder.countDocuments(filter)]);
    res.json({ success: true, data: { records, total, page, limit } });
  }),

  adminPaymentDetail: asyncHandler(async (req: Request, res: Response) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Invalid payment ID.', 400);
    const order: any = await PaymentOrder.findById(req.params.id).select('-checkoutReference -idempotencyKey -requestFingerprint -webhookFingerprint').lean();
    if (!order) throw new AppError('Payment not found.', 404);
    const refs = [order.publicOrderNumber, order.providerTransactionId].filter(Boolean);
    const [webhooks, grant] = await Promise.all([
      WebhookInbox.find({ provider: order.provider, $or: [{ orderReference: { $in: refs } }, { eventIdentity: order.providerTransactionId }] }).sort({ receivedAt: 1 }).select('eventIdentity orderReference signatureStatus processState rawPayloadHash receivedAt processedAt retryCount').lean(),
      CreditLedger.findOne({ eventKey: `grant:order:${order._id}` }).select('eventType deltaAvailable createdAt').lean(),
    ]);
    res.json({ success: true, data: { order, webhooks, grant } });
  }),

  adminRefundRequests: asyncHandler(async (req: Request, res: Response) => {
    const page = parsePagination(req.query.page, 1, 10000), limit = parsePagination(req.query.limit, 50, 100);
    const [records, total] = await Promise.all([RefundRequest.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), RefundRequest.countDocuments({})]);
    res.json({ success: true, data: { records, total, page, limit } });
  }),

  adminSummary: asyncHandler(async (_req: Request, res: Response) => {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [operationRows, provider, matchRows, pendingPayments, rejectedWebhooks] = await Promise.all([
      AiOperation.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      AiUsage.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: null, calls: { $sum: 1 }, unknownUsage: { $sum: { $cond: [{ $eq: ['$usageAvailability', 'unknown'] }, 1, 0] } }, retries: { $sum: { $cond: [{ $gt: ['$attempt', 1] }, 1, 0] } } } }]),
      Evaluation.aggregate([
        { $match: { createdAt: { $gte: since }, status: 'completed' } },
        { $group: { _id: null,
          completed: { $sum: { $cond: [{ $eq: ['$result.jobMatchingStatus', 'completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$result.jobMatchingStatus', 'failed'] }, 1, 0] } },
          unavailable: { $sum: { $cond: [{ $in: ['$result.jobMatchingStatus', [null, 'not_run']] }, 1, 0] } },
          noMatch: { $sum: { $cond: [{ $and: [
            { $eq: ['$result.jobMatchingStatus', 'completed'] },
            { $eq: [{ $size: { $ifNull: ['$result.jobMatches', []] } }, 0] },
          ] }, 1, 0] } },
        } },
      ]),
      PaymentOrder.countDocuments({ paymentStatus: 'pending' }), WebhookInbox.countDocuments({ processState: 'rejected' }),
    ]);
    const operations = Object.fromEntries(operationRows.map((row: any) => [row._id, row.count]));
    const match = matchRows[0] || { completed: 0, failed: 0, unavailable: 0, noMatch: 0 };
    const providerStats = provider[0] ? provider[0] : null;
    res.json({ success: true, data: {
      periodDays: 30,
      operations: { queued: operations.queued || 0, running: operations.running || 0, completed: operations.completed || 0, completedPartial: operations.completed_partial || 0, failed: operations.failed || 0 },
      provider: providerStats ? { calls: providerStats.calls, usageUnknown: providerStats.unknownUsage, retries: providerStats.retries } : { calls: null, usageUnknown: null, retries: null },
      matching: { completed: match.completed || 0, withMatches: Math.max(0, (match.completed || 0) - (match.noMatch || 0)), noMatch: match.noMatch || 0, failed: match.failed || 0, unavailable: match.unavailable || 0 },
      payments: { pending: pendingPayments, rejectedWebhooks },
    } });
  }),

  refundRequest: asyncHandler(async (req: Request, res: Response) => {
    const orderId = req.params.orderId;
    if (!mongoose.isValidObjectId(orderId)) throw new AppError('Invalid payment ID.', 400);
    const order = await PaymentOrder.findById(orderId);
    if (!order?.userId || order.paymentStatus !== 'paid' || order.fulfillmentStatus !== 'granted') throw new AppError('Only fulfilled paid orders can be reviewed for refund.', 409);
    const reasonCode = typeof req.body.reasonCode === 'string' && /^[a-z0-9_:-]{3,80}$/.test(req.body.reasonCode) ? req.body.reasonCode : '';
    if (!reasonCode) throw new AppError('A valid refund reason code is required.', 400);
    const prior = await RefundRequest.findOne({ orderId: order._id, state: { $nin: ['rejected'] } });
    if (prior) throw new AppError('A refund request already exists for this payment.', 409);
    const lot = await CreditLot.findOne({ sourceType: 'purchase', sourceId: String(order._id), userId: order.userId });
    if (!lot) throw new AppError('Eligible purchase credit lot not found.', 409);
    const used = lot.granted - lot.available - lot.revoked;
    const eligible = Math.max(0, lot.available);
    const amount = Math.floor((order.confirmedPaidAmountIdr || (order.packageSnapshot as any).amountIdr) * eligible / Math.max(1, lot.granted));
    if (!eligible || !amount) throw new AppError('No unused paid credits are eligible for proportional refund review.', 409);
    const session = await mongoose.startSession(); let record: any;
    try { await session.withTransaction(async () => {
      record = await RefundRequest.create([{ orderId: order._id, userId: order.userId, requestedAmountIdr: amount, allocatedLots: [{ lotId: lot._id, credits: eligible }], reasonCode, state: 'requested', actorId: req.authUser!.userId }], { session }).then(xs => xs[0]);
      // Reserve only currently available paid lot credits; payment/refund execution remains a manual support decision.
      const lotUpdate = await CreditLot.updateOne({ _id: lot._id, available: { $gte: eligible } }, { $inc: { available: -eligible, reserved: eligible } }, { session });
      if (lotUpdate.modifiedCount !== 1) throw new AppError('Purchase credits changed; retry the request.', 409);
      const reservation = await CreditReservation.create([{ userId: order.userId, kind: 'money_refund', referenceId: record._id, reservationKey: `refund:${record._id}`, totalCredits: eligible, allocations: [{ lotId: lot._id, credits: eligible }], status: 'held' }], { session }).then(xs => xs[0]);
      const walletUpdate = await BillingWallet.updateOne({ userId: order.userId, availableCredits: { $gte: eligible } }, { $inc: { availableCredits: -eligible, reservedCredits: eligible, version: 1 } }, { session });
      if (walletUpdate.modifiedCount !== 1) throw new AppError('Credit wallet changed; retry the request.', 409);
      await CreditLedger.create([{ userId: order.userId, eventKey: `refund-reserve:${record._id}`, eventType: 'reserve_refund', lotId: lot._id, reservationId: reservation._id, refundId: record._id, deltaAvailable: -eligible, deltaReserved: eligible, deltaConsumed: 0, deltaRevoked: 0, creditsGrantedDelta: 0, reasonCode: 'refund_review_reservation', actorType: 'admin', actorId: req.authUser!.userId, policyVersion: 'credits-v1' }], { session });
      await AdminAuditLog.create([{ actorUserId: req.authUser!.userId, action: 'billing.refund.requested', targetType: 'refund_request', targetId: String(record._id), details: { orderId: String(order._id), requestedAmountIdr: amount, eligibleCredits: eligible, usedCredits: used, reasonCode } }], { session });
    }); } finally { await session.endSession(); }
    res.status(201).json({ success: true, data: { refundRequestId: String(record._id), state: record.state, requestedAmountIdr: amount } });
  }),
};
