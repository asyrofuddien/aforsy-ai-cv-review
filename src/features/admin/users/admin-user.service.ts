import { Types } from 'mongoose';
import { AppError } from '../../../middlewares/error.middleware';
import { createAdminAuditEvent } from '../audit/admin-audit.repository';
import AuthSession from '../../../models/authSession.model';
import User from '../../../models/user.model';

async function audit(
  actorId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  await createAdminAuditEvent({
    actorUserId: actorId,
    action,
    targetType: 'user',
    targetId,
    details,
  });
}

export async function setUserActiveStatus(actorId: string, targetId: string, isActive: unknown) {
  if (typeof isActive !== 'boolean') throw new AppError('isActive must be a boolean', 400);
  if (targetId === actorId && !isActive)
    throw new AppError('You cannot deactivate your own account', 400);
  if (!Types.ObjectId.isValid(targetId)) throw new AppError('User not found', 404);
  const user = await User.findById(targetId);
  if (!user) throw new AppError('User not found', 404);
  if (
    !isActive &&
    user.role === 'admin' &&
    user.isActive &&
    (await User.countDocuments({ role: 'admin', isActive: true })) <= 1
  ) {
    throw new AppError('The last active administrator cannot be deactivated', 400);
  }
  const previous = user.isActive;
  user.isActive = isActive;
  await user.save();
  if (!isActive) await AuthSession.deleteMany({ userId: user._id });
  await audit(actorId, isActive ? 'user.activated' : 'user.deactivated', user.id, {
    previous,
    current: isActive,
  });
  return { id: user.id, isActive: user.isActive };
}

export async function setUserRole(actorId: string, targetId: string, role: unknown) {
  if (role !== 'admin' && role !== 'user') throw new AppError('Role must be user or admin', 400);
  if (targetId === actorId && role !== 'admin')
    throw new AppError('You cannot remove your own administrator role', 400);
  if (!Types.ObjectId.isValid(targetId)) throw new AppError('User not found', 404);
  const user = await User.findById(targetId);
  if (!user) throw new AppError('User not found', 404);
  if (
    role === 'user' &&
    user.role === 'admin' &&
    user.isActive &&
    (await User.countDocuments({ role: 'admin', isActive: true })) <= 1
  ) {
    throw new AppError('The last active administrator cannot be demoted', 400);
  }
  const previous = user.role;
  user.role = role;
  await user.save();
  await audit(actorId, role === 'admin' ? 'user.role.promoted' : 'user.role.demoted', user.id, {
    previous,
    current: role,
  });
  return { id: user.id, role: user.role };
}
