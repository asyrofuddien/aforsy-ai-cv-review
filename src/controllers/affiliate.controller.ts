import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middlewares/error.middleware';
import AffiliateConfig from '../models/affiliateConfig.model';
import AdminAuditLog from '../models/adminAuditLog.model';

export const getAffiliateConfig = asyncHandler(async (_req: Request, res: Response) => {
  const value: any = await AffiliateConfig.findOne({ key: 'landly' }).select('status url').lean();
  res.json({ success: true, data: value ? { status: value.status, url: value.status === 'active' ? value.url : undefined } : { status: 'coming_soon' } });
});

export const updateAffiliateConfig = asyncHandler(async (req: Request, res: Response) => {
  const status = req.body?.status;
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (status !== 'coming_soon' && status !== 'active') throw new AppError('Affiliate status must be coming_soon or active.', 400);
  if (status === 'active') {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new AppError('A valid HTTPS affiliate URL is required.', 400); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || url.length > 2000) throw new AppError('A valid HTTPS affiliate URL is required.', 400);
  }
  const update: any = { $set: { status, updatedBy: req.authUser!.userId } };
  if (status === 'active') update.$set.url = url;
  else update.$unset = { url: 1 };
  const config: any = await AffiliateConfig.findOneAndUpdate({ key: 'landly' }, update, { upsert: true, new: true, runValidators: true });
  await AdminAuditLog.create({ actorUserId: req.authUser!.userId, action: 'affiliate.config.updated', targetType: 'affiliate_config', targetId: 'landly', details: { status: config.status, urlHost: status === 'active' ? new URL(url).host : undefined } });
  res.json({ success: true, data: { status: config.status, url: config.status === 'active' ? config.url : undefined } });
});
