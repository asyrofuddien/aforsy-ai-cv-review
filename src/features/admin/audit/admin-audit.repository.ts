import AdminAuditLog from '../../../models/adminAuditLog.model';

export function createAdminAuditEvent(input: {
  actorUserId: string | object;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}) {
  return AdminAuditLog.create(input);
}

export function updateAdminAuditEvent(id: string, update: Record<string, unknown>) {
  return AdminAuditLog.updateOne({ _id: id }, update);
}

export async function listAdminAuditEvents(page: number, limit: number) {
  const [events, total] = await Promise.all([
    AdminAuditLog.find()
      .populate('actorUserId', 'displayName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AdminAuditLog.countDocuments(),
  ]);
  return { events, total };
}

export function countAdminAuditEvents() {
  return AdminAuditLog.countDocuments();
}
