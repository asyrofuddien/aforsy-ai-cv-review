import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { asyncHandler, AppError } from '../../middlewares/error.middleware';
import { requireAdmin } from '../../middlewares/auth.middleware';
import Evaluation from '../../models/evaluation.model';
import SavedCvDraft from '../../models/savedCvDraft.model';
import Document from '../../models/document.model';
import AtsPdf from '../../models/atsPDF.model';
import User from '../../models/user.model';
import AdminAuditLog from '../../models/adminAuditLog.model';
import {
  AiOperation,
  CreditReservation,
  PaymentOrder,
  WebhookInbox,
} from '../../models/billing.models';
import { DraftRevision, JobApplication, ReviewFeedback, SupportCase } from './workspace.models';

const router = Router();
const id = (value: unknown) => typeof value === 'string' && mongoose.isValidObjectId(value);
const string = (value: unknown, max: number, required = false) => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
    throw new AppError('Invalid text field.', 400);
  return value.trim();
};
const owner = (req: any) => req.authUser.userId;
const validAttachment = (item: any) => {
  if (
    typeof item?.name !== 'string' ||
    !item.name.trim() ||
    item.name.length > 120 ||
    typeof item?.dataUrl !== 'string' ||
    item.dataUrl.length > 1400000
  )
    return false;
  const match = item.dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/);
  if (!match) return false;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 1000000) return false;
  if (match[1] === 'png')
    return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (match[1] === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
};

router.get(
  '/feedback/:evaluationId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!id(req.params.evaluationId)) throw new AppError('Review not found.', 404);
    const review = await Evaluation.exists({ _id: req.params.evaluationId, userId: owner(req) });
    if (!review) throw new AppError('Review not found.', 404);
    const feedback = await ReviewFeedback.findOne({
      evaluationId: req.params.evaluationId,
      userId: owner(req),
    }).lean();
    res.json({ success: true, data: feedback });
  }),
);
router.put(
  '/feedback/:evaluationId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!id(req.params.evaluationId)) throw new AppError('Review not found.', 404);
    const review = await Evaluation.findOne({
      _id: req.params.evaluationId,
      userId: owner(req),
      status: 'completed',
    })
      .select('result.criteria')
      .lean();
    if (!review) throw new AppError('Completed review not found.', 404);
    if (typeof req.body?.helpful !== 'boolean')
      throw new AppError('Helpful must be true or false.', 400);
    const reason = string(req.body.reason, 500);
    const allowed = new Set((review.result?.criteria || []).map((item) => item.id));
    const applied = req.body.appliedCriteria ?? [];
    if (
      !Array.isArray(applied) ||
      applied.length > 6 ||
      applied.some((item) => typeof item !== 'string' || !allowed.has(item))
    )
      throw new AppError('Invalid applied criteria.', 400);
    const data = await ReviewFeedback.findOneAndUpdate(
      { evaluationId: req.params.evaluationId, userId: owner(req) },
      { $set: { helpful: req.body.helpful, reason, appliedCriteria: [...new Set(applied)] } },
      { upsert: true, new: true, runValidators: true },
    );
    res.json({ success: true, data });
  }),
);

router.get(
  '/cases',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await SupportCase.find({ userId: owner(req) })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data });
  }),
);
router.post(
  '/cases',
  asyncHandler(async (req: Request, res: Response) => {
    if (
      (await SupportCase.countDocuments({ userId: owner(req), status: { $ne: 'resolved' } })) >= 10
    )
      throw new AppError('Please wait for your existing support cases to be resolved.', 409);
    const subject = string(req.body?.subject, 120, true);
    const message = string(req.body?.message, 2000, true);
    const attachments = req.body?.attachments ?? [];
    if (
      !Array.isArray(attachments) ||
      attachments.length > 3 ||
      attachments.some((item: any) => !validAttachment(item))
    )
      throw new AppError('Attach up to three PNG, JPEG, or WebP images (1 MB each).', 400);
    const evaluationId = req.body?.evaluationId;
    const paymentOrderId = req.body?.paymentOrderId;
    if (
      evaluationId &&
      (!id(evaluationId) || !(await Evaluation.exists({ _id: evaluationId, userId: owner(req) })))
    )
      throw new AppError('Review not found.', 404);
    if (
      paymentOrderId &&
      (!id(paymentOrderId) ||
        !(await PaymentOrder.exists({ _id: paymentOrderId, userId: owner(req) })))
    )
      throw new AppError('Payment not found.', 404);
    const data = await SupportCase.create({
      userId: owner(req),
      subject,
      message,
      attachments,
      ticketNumber: `SUP-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${randomBytes(6).toString('hex').toUpperCase()}`,
      evaluationId,
      paymentOrderId,
    });
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/applications',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await JobApplication.find({ userId: owner(req) })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, data });
  }),
);
router.post(
  '/applications',
  asyncHandler(async (req: Request, res: Response) => {
    if ((await JobApplication.countDocuments({ userId: owner(req) })) >= 100)
      throw new AppError('Application limit reached.', 409);
    const title = string(req.body?.title, 120, true);
    const company = string(req.body?.company, 120, true);
    const url = string(req.body?.url, 2000);
    if (url && !/^https?:\/\//i.test(url)) throw new AppError('Invalid job URL.', 400);
    const draftId = req.body?.draftId;
    const evaluationId = req.body?.evaluationId;
    if (
      draftId &&
      (!id(draftId) || !(await SavedCvDraft.exists({ _id: draftId, userId: owner(req) })))
    )
      throw new AppError('Draft not found.', 404);
    if (
      evaluationId &&
      (!id(evaluationId) || !(await Evaluation.exists({ _id: evaluationId, userId: owner(req) })))
    )
      throw new AppError('Review not found.', 404);
    const data = await JobApplication.create({
      userId: owner(req),
      title,
      company,
      url,
      draftId,
      evaluationId,
    });
    res.status(201).json({ success: true, data });
  }),
);
router.patch(
  '/applications/:applicationId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!id(req.params.applicationId)) throw new AppError('Application not found.', 404);
    const set: Record<string, unknown> = {};
    for (const [field, max] of [
      ['title', 120],
      ['company', 120],
      ['url', 2000],
      ['note', 2000],
    ] as const) {
      if (req.body?.[field] !== undefined)
        set[field] = string(req.body[field], max, field === 'title' || field === 'company');
    }
    if (set.url && !/^https?:\/\//i.test(String(set.url)))
      throw new AppError('Invalid job URL.', 400);
    if (req.body?.status !== undefined) {
      if (!['saved', 'applied', 'interview', 'offer', 'rejected'].includes(req.body.status))
        throw new AppError('Invalid application status.', 400);
      set.status = req.body.status;
    }
    if (req.body?.draftId !== undefined) {
      if (
        req.body.draftId !== null &&
        (!id(req.body.draftId) ||
          !(await SavedCvDraft.exists({ _id: req.body.draftId, userId: owner(req) })))
      )
        throw new AppError('Draft not found.', 404);
      set.draftId = req.body.draftId;
    }
    if (!Object.keys(set).length) throw new AppError('No changes provided.', 400);
    const data = await JobApplication.findOneAndUpdate(
      { _id: req.params.applicationId, userId: owner(req) },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!data) throw new AppError('Application not found.', 404);
    res.json({ success: true, data });
  }),
);
router.delete(
  '/applications/:applicationId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!id(req.params.applicationId)) throw new AppError('Application not found.', 404);
    const deleted = await JobApplication.deleteOne({
      _id: req.params.applicationId,
      userId: owner(req),
    });
    if (!deleted.deletedCount) throw new AppError('Application not found.', 404);
    res.json({ success: true });
  }),
);

router.get(
  '/drafts/:draftId/revisions',
  asyncHandler(async (req: Request, res: Response) => {
    if (
      !id(req.params.draftId) ||
      !(await SavedCvDraft.exists({ _id: req.params.draftId, userId: owner(req) }))
    )
      throw new AppError('Draft not found.', 404);
    const data = await DraftRevision.find({ draftId: req.params.draftId, userId: owner(req) })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ success: true, data });
  }),
);
router.post(
  '/drafts/:draftId/revisions',
  asyncHandler(async (req: Request, res: Response) => {
    if (!id(req.params.draftId)) throw new AppError('Draft not found.', 404);
    const draft = await SavedCvDraft.findOne({
      _id: req.params.draftId,
      userId: owner(req),
    }).lean();
    if (!draft) throw new AppError('Draft not found.', 404);
    const evaluationId = req.body?.evaluationId;
    if (
      evaluationId &&
      (!id(evaluationId) || !(await Evaluation.exists({ _id: evaluationId, userId: owner(req) })))
    )
      throw new AppError('Review not found.', 404);
    const feedback = evaluationId
      ? await ReviewFeedback.findOne({ evaluationId, userId: owner(req) })
          .select('appliedCriteria')
          .lean()
      : null;
    const applied = req.body?.appliedCriteria ?? feedback?.appliedCriteria ?? [];
    if (
      !Array.isArray(applied) ||
      applied.length > 6 ||
      applied.some((item) => typeof item !== 'string' || item.length > 60)
    )
      throw new AppError('Invalid applied criteria.', 400);
    const data = await DraftRevision.create({
      userId: owner(req),
      draftId: draft._id,
      name: draft.name,
      data: draft.data,
      evaluationId,
      appliedCriteria: applied,
    });
    const old = await DraftRevision.find({ draftId: draft._id, userId: owner(req) })
      .sort({ createdAt: -1 })
      .skip(20)
      .select('_id')
      .lean();
    if (old.length)
      await DraftRevision.deleteMany({
        _id: { $in: old.map((item) => item._id) },
        userId: owner(req),
      });
    res.status(201).json({ success: true, data });
  }),
);

router.get(
  '/admin/overview',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      registered,
      uploads,
      reviewsStarted,
      reviews,
      drafts,
      generatedCvs,
      paidOrders,
      helpful,
      unhelpful,
      applied,
      casesOpen,
      casesInProgress,
      webhookRejected,
      operationsFailed,
      reservationsHeld,
      applications,
    ] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: since } }),
      Document.countDocuments({ uploadedAt: { $gte: since }, type: 'cv' }),
      Evaluation.countDocuments({ createdAt: { $gte: since } }),
      Evaluation.countDocuments({ createdAt: { $gte: since }, status: 'completed' }),
      SavedCvDraft.countDocuments({ createdAt: { $gte: since } }),
      AtsPdf.countDocuments({ createdAt: { $gte: since } }),
      PaymentOrder.countDocuments({ paidAt: { $gte: since }, paymentStatus: 'paid' }),
      ReviewFeedback.countDocuments({ createdAt: { $gte: since }, helpful: true }),
      ReviewFeedback.countDocuments({ createdAt: { $gte: since }, helpful: false }),
      ReviewFeedback.countDocuments({
        updatedAt: { $gte: since },
        'appliedCriteria.0': { $exists: true },
      }),
      SupportCase.countDocuments({ status: 'open' }),
      SupportCase.countDocuments({ status: 'in_progress' }),
      WebhookInbox.countDocuments({ processState: 'rejected', receivedAt: { $gte: since } }),
      AiOperation.countDocuments({ status: 'failed', createdAt: { $gte: since } }),
      CreditReservation.countDocuments({
        status: 'held',
        createdAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) },
      }),
      JobApplication.countDocuments({ createdAt: { $gte: since } }),
    ]);
    res.json({
      success: true,
      data: {
        periodDays: 30,
        registered,
        uploads,
        reviewsStarted,
        reviews,
        drafts,
        generatedCvs,
        paidOrders,
        helpful,
        unhelpful,
        applied,
        casesOpen,
        casesInProgress,
        webhookRejected,
        operationsFailed,
        reservationsHeld,
        applications,
      },
    });
  }),
);
router.get(
  '/admin/feedback',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await ReviewFeedback.find({ helpful: false })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('userId evaluationId reason appliedCriteria createdAt updatedAt')
      .lean();
    res.json({ success: true, data });
  }),
);
router.get(
  '/admin/cases',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const data = await SupportCase.find({ status: { $ne: 'resolved' } })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    const [users, evaluations, orders, operations] = await Promise.all([
      User.find({ _id: { $in: data.map((item) => item.userId) } })
        .select('displayName email')
        .lean(),
      Evaluation.find({ _id: { $in: data.map((item) => item.evaluationId).filter(Boolean) } })
        .select('status result.jobMatchingStatus')
        .lean(),
      PaymentOrder.find({ _id: { $in: data.map((item) => item.paymentOrderId).filter(Boolean) } })
        .select('paymentStatus fulfillmentStatus publicOrderNumber')
        .lean(),
      AiOperation.find({
        resourceId: { $in: data.map((item) => item.evaluationId).filter(Boolean) },
      })
        .select('resourceId status failureCode')
        .lean(),
    ]);
    const userById = new Map(users.map((item) => [String(item._id), item]));
    const reviewById = new Map(evaluations.map((item) => [String(item._id), item]));
    const orderById = new Map(orders.map((item) => [String(item._id), item]));
    const operationByReview = new Map(operations.map((item) => [String(item.resourceId), item]));
    const reservations = await CreditReservation.find({
      referenceId: { $in: operations.map((item) => item._id) },
    })
      .select('referenceId status totalCredits capturedCredits releasedCredits')
      .lean();
    const reservationByOperation = new Map(
      reservations.map((item) => [String(item.referenceId), item]),
    );
    res.json({
      success: true,
      data: data.map((item) => ({
        ...item,
        customer: userById.get(String(item.userId)),
        review: reviewById.get(String(item.evaluationId)),
        payment: orderById.get(String(item.paymentOrderId)),
        operation: operationByReview.get(String(item.evaluationId)),
        reservation: reservationByOperation.get(
          String(operationByReview.get(String(item.evaluationId))?._id),
        ),
      })),
    });
  }),
);
router.patch(
  '/admin/cases/:caseId',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    if (!id(req.params.caseId) || !['open', 'in_progress', 'resolved'].includes(req.body?.status))
      throw new AppError('Invalid case update.', 400);
    const adminNote = string(req.body?.adminNote, 2000);
    const data = await SupportCase.findByIdAndUpdate(
      req.params.caseId,
      {
        $set: {
          status: req.body.status,
          adminNote,
          resolvedAt: req.body.status === 'resolved' ? new Date() : null,
        },
      },
      { new: true, runValidators: true },
    );
    if (!data) throw new AppError('Case not found.', 404);
    await AdminAuditLog.create({
      actorUserId: req.authUser!.userId,
      actorType: 'user',
      action: 'support.case_update',
      targetType: 'support_case',
      targetId: String(data._id),
      details: { status: data.get('status') },
    });
    res.json({ success: true, data });
  }),
);

export default router;
