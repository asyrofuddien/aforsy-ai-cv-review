import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler, AppError } from '../middlewares/error.middleware';
import AdminAuditLog from '../models/adminAuditLog.model';
import AtsTemplate, { AtsTemplateStatus, AtsTemplateVariant } from '../models/atsTemplate.model';
import User from '../models/user.model';

const audit = (req: Request, action: string, targetType: 'user' | 'ats_template', targetId: string, details: Record<string, unknown> = {}) =>
  AdminAuditLog.create({ actorUserId: req.authUser!.userId, action, targetType, targetId, details });

const contrastAgainstWhite = (hex: string): number => {
  const channels = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return 1.05 / (luminance + 0.05);
};

const validateTemplate = (input: any): void => {
  const layout = input.layout;
  const preview = input.preview;
  if (!input.name?.trim() || !input.description?.trim() || !input.version?.trim()) throw new AppError('Name, description, and version are required', 400);
  if (!layout || layout.columns !== 1 || !['classic', 'modern', 'compact'].includes(layout.variant)) throw new AppError('Template must use a supported single-column layout', 400);
  if (layout.fontFamily !== 'Arial, Helvetica, sans-serif' || !['0.3in', '0.4in', '0.5in'].includes(layout.pageMargin)) throw new AppError('Template font or page margin is not supported', 400);
  if (!['standard', 'compact'].includes(layout.density) || !/^#[0-9a-f]{6}$/i.test(layout.headingColor || '') || !/^#[0-9a-f]{6}$/i.test(layout.accentColor || '')) throw new AppError('Template layout configuration is invalid', 400);
  if (contrastAgainstWhite(layout.headingColor) < 4.5 || contrastAgainstWhite(layout.accentColor) < 4.5) throw new AppError('Template heading and accent colors must have at least 4.5:1 contrast on white', 400);
  if (!preview || !preview.sampleName?.trim() || !preview.sampleRole?.trim() || !preview.summary?.trim()) throw new AppError('A complete sample preview is required before a template can be activated', 400);
  if (input.status === 'active' && !['classic', 'modern', 'compact'].includes(layout.variant)) throw new AppError('The template renderer is unavailable', 400);
};

export class AdminController {
  summary = asyncHandler(async (_req: Request, res: Response) => {
    const [users, activeUsers, admins, templates, activeTemplates, auditEvents] = await Promise.all([
      User.countDocuments(), User.countDocuments({ isActive: true }), User.countDocuments({ role: 'admin', isActive: true }),
      AtsTemplate.countDocuments({ status: { $ne: 'archived' } }), AtsTemplate.countDocuments({ status: 'active' }),
      AdminAuditLog.countDocuments(),
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

  setUserStatus = asyncHandler(async (req: Request, res: Response) => {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') throw new AppError('isActive must be a boolean', 400);
    if (req.params.id === req.authUser!.userId && !isActive) throw new AppError('You cannot deactivate your own account', 400);
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    if (!isActive && user.role === 'admin' && user.isActive && await User.countDocuments({ role: 'admin', isActive: true }) <= 1) {
      throw new AppError('The last active administrator cannot be deactivated', 400);
    }
    const oldValue = user.isActive;
    user.isActive = isActive;
    await user.save();
    if (!isActive) {
      const AuthSession = (await import('../models/authSession.model')).default;
      await AuthSession.deleteMany({ userId: user._id });
    }
    await audit(req, isActive ? 'user.activated' : 'user.deactivated', 'user', user.id, { previous: oldValue, current: isActive });
    res.json({ success: true, data: { id: user.id, isActive: user.isActive } });
  });

  setUserRole = asyncHandler(async (req: Request, res: Response) => {
    const { role } = req.body;
    if (role !== 'admin' && role !== 'user') throw new AppError('Role must be user or admin', 400);
    if (req.params.id === req.authUser!.userId && role !== 'admin') throw new AppError('You cannot remove your own administrator role', 400);
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    if (role === 'user' && user.role === 'admin' && user.isActive && await User.countDocuments({ role: 'admin', isActive: true }) <= 1) {
      throw new AppError('The last active administrator cannot be demoted', 400);
    }
    const oldValue = user.role;
    user.role = role;
    await user.save();
    await audit(req, role === 'admin' ? 'user.role.promoted' : 'user.role.demoted', 'user', user.id, { previous: oldValue, current: role });
    res.json({ success: true, data: { id: user.id, role: user.role } });
  });

  listTemplates = asyncHandler(async (_req: Request, res: Response) => {
    const templates = await AtsTemplate.find().sort({ status: 1, name: 1 }).lean();
    res.json({ success: true, data: templates });
  });

  createTemplate = asyncHandler(async (req: Request, res: Response) => {
    const { id, name, description, version, status, layout, preview } = req.body;
    const safeId = String(id || '').trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeId)) throw new AppError('Template ID must be a lowercase slug', 400);
    if (!['draft', 'inactive', 'active'].includes(status)) throw new AppError('Invalid template status', 400);
    const data = { id: safeId, name, description, version, status: status as AtsTemplateStatus, layout: layout as { variant: AtsTemplateVariant }, preview };
    validateTemplate(data);
    const template = await AtsTemplate.create({ ...data, createdBy: new Types.ObjectId(req.authUser!.userId), updatedBy: new Types.ObjectId(req.authUser!.userId) });
    await audit(req, 'ats_template.created', 'ats_template', template.id, { status: template.status, version: template.version });
    res.status(201).json({ success: true, data: template });
  });

  updateTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = await AtsTemplate.findOne({ id: req.params.id });
    if (!template) throw new AppError('Template not found', 404);
    const next = {
      name: req.body.name ?? template.name,
      description: req.body.description ?? template.description,
      version: req.body.version ?? template.version,
      status: req.body.status ?? template.status,
      layout: req.body.layout ?? { ...template.layout },
      preview: req.body.preview ?? { ...template.preview },
    };
    if (!['draft', 'inactive', 'active', 'archived'].includes(next.status)) throw new AppError('Invalid template status', 400);
    validateTemplate(next);
    const previousStatus = template.status;
    if (previousStatus === 'active' && next.status !== 'active' && await AtsTemplate.countDocuments({ status: 'active' }) <= 1) {
      throw new AppError('At least one active ATS template must remain', 400);
    }
    Object.assign(template, next, { updatedBy: new Types.ObjectId(req.authUser!.userId) });
    await template.save();
    await audit(req, next.status === 'archived' ? 'ats_template.archived' : next.status === 'active' && previousStatus !== 'active' ? 'ats_template.activated' : 'ats_template.updated', 'ats_template', template.id, { previousStatus, status: template.status, version: template.version });
    res.json({ success: true, data: template });
  });

  archiveTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = await AtsTemplate.findOne({ id: req.params.id });
    if (!template) throw new AppError('Template not found', 404);
    if (template.status === 'active' && await AtsTemplate.countDocuments({ status: 'active' }) <= 1) throw new AppError('At least one active ATS template must remain', 400);
    template.status = 'archived';
    template.updatedBy = new Types.ObjectId(req.authUser!.userId);
    await template.save();
    await audit(req, 'ats_template.archived', 'ats_template', template.id, { version: template.version });
    res.json({ success: true, data: template });
  });

  listAudit = asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const [events, total] = await Promise.all([
      AdminAuditLog.find().populate('actorUserId', 'displayName email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AdminAuditLog.countDocuments(),
    ]);
    res.json({ success: true, data: events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });
}

export default new AdminController();
