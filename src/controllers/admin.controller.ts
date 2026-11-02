import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler, AppError } from '../middlewares/error.middleware';
import AtsTemplate from '../models/atsTemplate.model';
import User from '../models/user.model';
import Document from '../models/document.model';
import Evaluation from '../models/evaluation.model';
import CvMatcher from '../models/cvMatcher.model';
import AtsPdf from '../models/atsPDF.model';
import queueService from '../services/queue.service';
import appLogger from '../utils/logger';
import { archiveAdminTemplate, createAdminTemplate, updateAdminTemplate } from '../features/admin/templates/admin-template.service';
import { setUserActiveStatus, setUserRole } from '../features/admin/users/admin-user.service';
import { createAdminAuditEvent, updateAdminAuditEvent, listAdminAuditEvents, countAdminAuditEvents } from '../features/admin/audit/admin-audit.repository';

const logger = appLogger.child({ scope: 'admin' });

type AdminActivityEvent = {
  id: string;
  type: 'document' | 'evaluation' | 'cv_matcher' | 'ats_cv';
  at: Date;
  status: string;
  label: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  error?: string;
  retryable?: boolean;
  queueJobId?: string;
};

export class AdminController {
  summary = asyncHandler(async (_req: Request, res: Response) => {
    const [users, activeUsers, admins, templates, activeTemplates, auditEvents] = await Promise.all([
      User.countDocuments(), User.countDocuments({ isActive: true }), User.countDocuments({ role: 'admin', isActive: true }),
      AtsTemplate.countDocuments({ status: { $ne: 'archived' } }), AtsTemplate.countDocuments({ status: 'active' }),
      countAdminAuditEvents(),
    ]);
    res.json({ success: true, data: { users, activeUsers, admins, templates, activeTemplates, auditEvents } });
  });

  listUsers = asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filter: Record<string, unknown> = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ email: { $regex: escaped, $options: 'i' } }, { displayName: { $regex: escaped, $options: 'i' } }];
    }
    const [users, total] = await Promise.all([
      User.find(filter).select('email displayName role isActive isEmailVerified createdAt updatedAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, data: users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });

  getUserDetails = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new AppError('Invalid user ID', 400);
    const user = await User.findById(req.params.id)
      .select('email displayName role isActive isEmailVerified createdAt')
      .lean();
    if (!user) throw new AppError('User not found', 404);

    const [documents, evaluations, cvMatches, atsCvs] = await Promise.all([
      Document.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      Evaluation.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      CvMatcher.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      AtsPdf.countDocuments({ userId: user._id }),
    ]);

    const counts = (rows: Array<{ _id: string; count: number }>) =>
      rows.reduce<Record<string, number>>((result, row) => {
        result[row._id] = row.count;
        return result;
      }, {});

    res.json({
      success: true,
      data: {
        user,
        activity: {
          documents: counts(documents),
          evaluations: counts(evaluations),
          cvMatches: counts(cvMatches),
          generatedAtsCvs: atsCvs,
        },
      },
    });
  });

  getUserActivity = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new AppError('Invalid user ID', 400);
    const userId = new Types.ObjectId(req.params.id);
    if (!(await User.exists({ _id: userId }))) throw new AppError('User not found', 404);
    const requestedPage = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit) || 20)));

    const [documentCount, evaluationCount, cvMatchCount, atsCvCount] = await Promise.all([
      Document.countDocuments({ userId }),
      Evaluation.countDocuments({ userId }),
      CvMatcher.countDocuments({ userId }),
      AtsPdf.countDocuments({ userId }),
    ]);
    const total = documentCount + evaluationCount + cvMatchCount + atsCvCount;
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, pages);
    const candidateLimit = (page - 1) * limit + limit;

    const [documents, evaluations, cvMatches, atsCvs] = await Promise.all([
      Document.find({ userId }).select('originalName mimeType size type uploadedAt').sort({ uploadedAt: -1, _id: -1 }).limit(candidateLimit).lean(),
      Evaluation.find({ userId }).select('status error queueJobId createdAt updatedAt').sort({ createdAt: -1, _id: -1 }).limit(candidateLimit).lean(),
      CvMatcher.find({ userId }).select('status error queueJobId createdAt updatedAt').sort({ createdAt: -1, _id: -1 }).limit(candidateLimit).lean(),
      AtsPdf.find({ userId }).select('file_name createdAt').sort({ createdAt: -1, _id: -1 }).limit(candidateLimit).lean(),
    ]);

    const events: AdminActivityEvent[] = [
      ...documents.map((document) => ({
        id: String(document._id),
        type: 'document' as const,
        at: document.uploadedAt,
        status: 'uploaded',
        label: document.type === 'cv' ? 'CV upload' : 'Project upload',
        fileName: document.originalName,
        mimeType: document.mimeType,
        size: document.size,
      })),
      ...evaluations.map((evaluation) => ({
        id: String(evaluation._id),
        type: 'evaluation' as const,
        at: evaluation.createdAt,
        status: evaluation.status,
        label: 'CV review',
        error: evaluation.error ? this.safeProcessError(evaluation.error) : undefined,
        queueJobId: evaluation.queueJobId,
      })),
      ...cvMatches.map((cvMatch) => ({
        id: String(cvMatch._id),
        type: 'cv_matcher' as const,
        at: cvMatch.createdAt,
        status: cvMatch.status,
        label: 'CV matcher',
        error: cvMatch.error ? this.safeProcessError(cvMatch.error) : undefined,
        queueJobId: cvMatch.queueJobId,
      })),
      ...atsCvs.map((atsCv) => ({
        id: String(atsCv._id),
        type: 'ats_cv' as const,
        at: atsCv.createdAt,
        status: 'generated',
        label: 'ATS CV generated',
        fileName: atsCv.file_name || 'Generated CV',
      })),
    ]
      .sort((left, right) => right.at.getTime() - left.at.getTime() || right.id.localeCompare(left.id))
      .slice((page - 1) * limit, page * limit);

    const pageEvents = await Promise.all(events.map(async ({ queueJobId, ...event }) => {
      if (event.type !== 'evaluation' && event.type !== 'cv_matcher') return event;
      const queueType = event.type === 'evaluation' ? 'evaluation' : 'cv-matcher';
      const queueState = event.status === 'failed' && queueJobId
        ? await queueService.getJobState(queueType, queueJobId)
        : null;
      return {
        ...event,
        status: queueState === 'active' ? 'processing' : ['waiting', 'delayed', 'waiting-children'].includes(queueState || '') ? 'queued' : event.status,
        retryable: event.status === 'failed' && queueState === 'failed',
      };
    }));

    res.json({ success: true, data: pageEvents, pagination: { page, limit, total, pages } });
  });

  retryUserProcess = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.userId) || !Types.ObjectId.isValid(req.params.processId)) {
      throw new AppError('Invalid user or process ID', 400);
    }
    if (req.params.type !== 'evaluation' && req.params.type !== 'cv-matcher') {
      throw new AppError('Unsupported process type', 400);
    }

    const userId = new Types.ObjectId(req.params.userId);
    const filter = { _id: req.params.processId, userId };
    const process = req.params.type === 'evaluation'
      ? await Evaluation.findOne(filter).lean()
      : await CvMatcher.findOne(filter).lean();
    if (!process) throw new AppError('Process not found', 404);
    if (process.status !== 'failed') throw new AppError('Only failed processes can be retried', 409);
    if (!process.queueJobId) throw new AppError('This older process has no retryable queue record', 409);

    const stateFilter = { ...filter, status: 'failed' };
    const queued = req.params.type === 'evaluation'
      ? await Evaluation.findOneAndUpdate(
        stateFilter,
        { $set: { status: 'queued' }, $unset: { error: 1 } },
        { new: true },
      )
      : await CvMatcher.findOneAndUpdate(
        stateFilter,
        { $set: { status: 'queued' }, $unset: { error: 1 } },
        { new: true },
      );
    if (!queued) throw new AppError('This process has already changed state', 409);

    let auditEvent;
    let retryAccepted = false;
    try {
      auditEvent = await createAdminAuditEvent({
        actorUserId: req.authUser!.userId,
        action: 'process.retry_requested',
        targetType: req.params.type === 'evaluation' ? 'evaluation' : 'cv_matcher',
        targetId: String(process._id),
        details: { userId: String(userId), queueJobId: process.queueJobId, outcome: 'pending' },
      });

      const retried = await queueService.retryFailedJob(
        req.params.type === 'evaluation' ? 'evaluation' : 'cv-matcher',
        process.queueJobId,
      );
      if (!retried) {
        const revertFailed = req.params.type === 'evaluation' ? Evaluation.updateOne : CvMatcher.updateOne;
        await revertFailed(
          { _id: process._id, userId, status: 'queued' },
          { $set: { status: 'failed', ...(process.error ? { error: process.error } : {}) } },
        );
        await updateAdminAuditEvent(String(auditEvent._id), { $set: { 'details.outcome': 'unavailable' } });
        throw new AppError('The failed queue record is no longer available for retry', 409);
      }

      retryAccepted = true;
      try {
        await updateAdminAuditEvent(String(auditEvent._id), { $set: { 'details.outcome': 'queued' } });
      } catch (error) {
        logger.error('Process was requeued but its audit outcome could not be updated', {
          processId: String(process._id),
          auditEventId: String(auditEvent._id),
          error,
        });
      }
      res.status(202).json({ success: true, data: { id: String(process._id), status: 'queued' } });
    } catch (error) {
      if (!retryAccepted && !(error instanceof AppError && error.statusCode === 409)) {
        const revertFailed = req.params.type === 'evaluation' ? Evaluation.updateOne : CvMatcher.updateOne;
        await revertFailed(
          { _id: process._id, userId, status: 'queued' },
          { $set: { status: 'failed', ...(process.error ? { error: process.error } : {}) } },
        );
        if (auditEvent) {
          await updateAdminAuditEvent(String(auditEvent._id), { $set: { 'details.outcome': 'failed' } });
        }
      }
      if (error instanceof AppError) throw error;
      logger.error('Failed to retry user process', { processId: String(process._id), error });
      throw new AppError('Could not retry this process', 500);
    }
  });

  private safeProcessError(message: string): string {
    return message
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/[A-Z]:\\[^\s"'<>]+|\/(?:[^\s"'<>/]+\/)*[^\s"'<>/]*/gi, '[path]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
      .slice(0, 240);
  }

  setUserStatus = asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await setUserActiveStatus(req.authUser!.userId, req.params.id, req.body.isActive) });
  });

  setUserRole = asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: await setUserRole(req.authUser!.userId, req.params.id, req.body.role) });
  });

  listTemplates = asyncHandler(async (_req: Request, res: Response) => {
    const templates = await AtsTemplate.find().sort({ status: 1, name: 1 }).lean();
    res.json({ success: true, data: templates });
  });

  createTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = await createAdminTemplate(req.authUser!.userId, req.body);
    res.status(201).json({ success: true, data: template });
  });

  updateTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = await updateAdminTemplate(req.authUser!.userId, req.params.id, req.body);
    res.json({ success: true, data: template });
  });

  archiveTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = await archiveAdminTemplate(req.authUser!.userId, req.params.id);
    res.json({ success: true, data: template });
  });

  listAudit = asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const { events, total } = await listAdminAuditEvents(page, limit);
    res.json({ success: true, data: events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
}

export default new AdminController();
