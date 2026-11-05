import { Types } from 'mongoose';
import { AppError } from '../../../middlewares/error.middleware';
import { createAdminAuditEvent } from '../audit/admin-audit.repository';
import AtsTemplate, {
  AtsTemplateStatus,
  AtsTemplateVariant,
} from '../../../models/atsTemplate.model';
import { validateTemplate } from './template.validation';

export async function createAdminTemplate(actorId: string, input: Record<string, any>) {
  const { id, name, description, version, status, layout, preview } = input;
  const safeId = String(id || '')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeId))
    throw new AppError('Template ID must be a lowercase slug', 400);
  if (!['draft', 'inactive', 'active'].includes(status))
    throw new AppError('Invalid template status', 400);
  const data = {
    id: safeId,
    name,
    description,
    version,
    status: status as AtsTemplateStatus,
    layout: layout as { variant: AtsTemplateVariant },
    preview,
  };
  validateTemplate(data);
  const actor = new Types.ObjectId(actorId);
  const template = await AtsTemplate.create({ ...data, createdBy: actor, updatedBy: actor });
  await createAdminAuditEvent({
    actorUserId: actor,
    action: 'ats_template.created',
    targetType: 'ats_template',
    targetId: template.id,
    details: { status: template.status, version: template.version },
  });
  return template;
}

export async function updateAdminTemplate(actorId: string, id: string, input: Record<string, any>) {
  const template = await AtsTemplate.findOne({ id });
  if (!template) throw new AppError('Template not found', 404);
  const next = {
    name: input.name ?? template.name,
    description: input.description ?? template.description,
    version: input.version ?? template.version,
    status: input.status ?? template.status,
    layout: input.layout ?? { ...template.layout },
    preview: input.preview ?? { ...template.preview },
  };
  if (!['draft', 'inactive', 'active', 'archived'].includes(next.status))
    throw new AppError('Invalid template status', 400);
  validateTemplate(next);
  const previousStatus = template.status;
  if (
    previousStatus === 'active' &&
    next.status !== 'active' &&
    (await AtsTemplate.countDocuments({ status: 'active' })) <= 1
  ) {
    throw new AppError('At least one active ATS template must remain', 400);
  }
  Object.assign(template, next, { updatedBy: new Types.ObjectId(actorId) });
  await template.save();
  const action =
    next.status === 'archived'
      ? 'ats_template.archived'
      : next.status === 'active' && previousStatus !== 'active'
        ? 'ats_template.activated'
        : 'ats_template.updated';
  await createAdminAuditEvent({
    actorUserId: actorId,
    action,
    targetType: 'ats_template',
    targetId: template.id,
    details: { previousStatus, status: template.status, version: template.version },
  });
  return template;
}

export async function archiveAdminTemplate(actorId: string, id: string) {
  const template = await AtsTemplate.findOne({ id });
  if (!template) throw new AppError('Template not found', 404);
  if (
    template.status === 'active' &&
    (await AtsTemplate.countDocuments({ status: 'active' })) <= 1
  ) {
    throw new AppError('At least one active ATS template must remain', 400);
  }
  template.status = 'archived';
  template.updatedBy = new Types.ObjectId(actorId);
  await template.save();
  await createAdminAuditEvent({
    actorUserId: actorId,
    action: 'ats_template.archived',
    targetType: 'ats_template',
    targetId: template.id,
    details: { version: template.version },
  });
  return template;
}
