import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../../middlewares/error.middleware';
import AdminAuditLog from '../../models/adminAuditLog.model';
import { BillingPackage, PaymentOrder } from '../../models/billing.models';

type PackageInput = {
  nameId: string; nameEn: string; descriptionId: string; descriptionEn: string; amountIdr: number; credits: number;
  termsVersion: string; lynkProductId: string; lynkCheckoutUrl: string;
};

function packageInput(body: any): PackageInput {
  const result: PackageInput = {
    nameId: typeof body?.nameId === 'string' ? body.nameId.trim() : '',
    nameEn: typeof body?.nameEn === 'string' ? body.nameEn.trim() : '',
    descriptionId: typeof body?.descriptionId === 'string' ? body.descriptionId.trim() : '',
    descriptionEn: typeof body?.descriptionEn === 'string' ? body.descriptionEn.trim() : '',
    amountIdr: body?.amountIdr,
    credits: body?.credits,
    termsVersion: typeof body?.termsVersion === 'string' ? body.termsVersion.trim() : '',
    lynkProductId: typeof body?.lynkProductId === 'string' ? body.lynkProductId.trim() : '',
    lynkCheckoutUrl: typeof body?.lynkCheckoutUrl === 'string' ? body.lynkCheckoutUrl.trim() : '',
  };
  if (!result.nameId || result.nameId.length > 120 || !result.nameEn || result.nameEn.length > 120 ||
      !result.descriptionId || result.descriptionId.length > 300 || !result.descriptionEn || result.descriptionEn.length > 300 ||
      !Number.isSafeInteger(result.amountIdr) || result.amountIdr <= 0 ||
      !Number.isSafeInteger(result.credits) || result.credits <= 0 ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(result.termsVersion) ||
      !/^[A-Za-z0-9_-]{1,180}$/.test(result.lynkProductId) ||
      !/^https:\/\/lynk\.id\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(result.lynkCheckoutUrl)) {
    throw new AppError('Catalog details are invalid. Check names, whole-number price and credits, terms, and Lynk product mapping.', 400);
  }
  return result;
}

async function audit(actorId: string, action: string, pkg: any): Promise<void> {
  await AdminAuditLog.create({ actorUserId: actorId, action, targetType: 'billing_catalog', targetId: `${pkg.sku}:${pkg.version}`, details: { amountIdr: pkg.amountIdr, credits: pkg.credits, active: pkg.active } });
}

export const adminCatalogController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const packages = await BillingPackage.find({ sku: { $ne: 'welcome.v1' } }).sort({ sku: 1, version: -1 }).lean();
    res.json({ success: true, data: packages });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const sku = typeof req.body?.sku === 'string' ? req.body.sku.trim() : '';
    if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(sku) || sku === 'welcome.v1') throw new AppError('Enter a valid, unique package SKU.', 400);
    const input = packageInput(req.body);
    const prior = await BillingPackage.findOne({ sku }).sort({ version: -1 });
    if (prior?.active) throw new AppError('This SKU already has an active package. Edit that package to create a new version.', 409);
    const pkg = await BillingPackage.create({ sku, version: (prior?.version || 0) + 1, ...input, currency: 'IDR', active: true, effectiveFrom: new Date() });
    await audit(req.authUser!.userId, 'billing.catalog.created', pkg);
    res.status(201).json({ success: true, data: pkg });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Invalid package ID.', 400);
    const current = await BillingPackage.findById(req.params.id);
    if (!current || current.sku === 'welcome.v1' || !current.active) throw new AppError('Active purchasable package not found.', 404);
    const input = packageInput(req.body);
    const hasOrders = await PaymentOrder.exists({ 'packageSnapshot.sku': current.sku, 'packageSnapshot.version': current.version });
    const paymentTermsUnchanged = input.amountIdr === current.amountIdr && input.credits === current.credits &&
      input.termsVersion === current.termsVersion && input.lynkProductId === current.lynkProductId &&
      input.lynkCheckoutUrl === current.lynkCheckoutUrl;

    if (!hasOrders || paymentTermsUnchanged) {
      Object.assign(current, input);
      await current.save();
      await audit(req.authUser!.userId, 'billing.catalog.updated', current);
      res.json({ success: true, data: current });
      return;
    }
    if (input.lynkProductId === current.lynkProductId) throw new AppError('This package has payment history. Create a new Lynk product and use its product ID before saving a new version, so older receipts remain verifiable.', 409);

    const session = await mongoose.startSession();
    let next: any;
    try {
      await session.withTransaction(async () => {
        const active = await BillingPackage.findOne({ _id: current._id, active: true }).session(session);
        if (!active) throw new AppError('Package changed while you were editing. Reload the catalog.', 409);
        const effectiveUntil = new Date();
        active.active = false;
        active.effectiveUntil = effectiveUntil;
        await active.save({ session });
        [next] = await BillingPackage.create([{
          sku: active.sku, version: active.version + 1, ...input, currency: 'IDR', active: true,
          effectiveFrom: effectiveUntil,
        }], { session });
        await AdminAuditLog.create([{
          actorUserId: req.authUser!.userId, action: 'billing.catalog.versioned', targetType: 'billing_catalog',
          targetId: `${next.sku}:${next.version}`, details: { amountIdr: next.amountIdr, credits: next.credits, active: true, previousVersion: active.version },
        }], { session });
      });
    } finally { await session.endSession(); }
    res.json({ success: true, data: next });
  }),

  archive: asyncHandler(async (req: Request, res: Response) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Invalid package ID.', 400);
    const pkg = await BillingPackage.findOneAndUpdate(
      { _id: req.params.id, active: true, sku: { $ne: 'welcome.v1' } },
      { $set: { active: false, effectiveUntil: new Date() } }, { new: true },
    );
    if (!pkg) throw new AppError('Active purchasable package not found.', 404);
    await audit(req.authUser!.userId, 'billing.catalog.archived', pkg);
    res.json({ success: true, data: pkg });
  }),
};
