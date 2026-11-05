import { createHash, randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { AppError } from '../../../middlewares/error.middleware';
import User from '../../../models/user.model';
import { BillingPackage, BillingWallet, PaymentOrder } from '../../../models/billing.models';
import config from '../../../config/config';
import { lynkAdapter } from '../providers/lynk.adapter';

const PAYMENT_INTENT_TTL_MS = 30 * 60_000;

export async function expirePendingPaymentOrders(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PAYMENT_INTENT_TTL_MS);
  const result = await PaymentOrder.updateMany(
    {
      paymentStatus: 'pending',
      $or: [
        { providerExpiresAt: { $lte: now } },
        { providerExpiresAt: null, createdAt: { $lte: cutoff } },
      ],
    },
    { $set: { paymentStatus: 'cancelled' } },
  );
  return result.modifiedCount || 0;
}

export const orderService = {
  async createPurchaseIntent(input: {
    userId: string;
    sku: string;
    termsVersion: string;
    idempotencyKey: string;
    locale: string;
  }) {
    if (!config.billing.checkoutEnabled || config.billing.mode !== 'live')
      throw new AppError('Lynk checkout requires an explicitly enabled live billing mode.', 503);
    if (!/^[A-Za-z0-9._:-]{8,180}$/.test(input.idempotencyKey))
      throw new AppError('A valid Idempotency-Key is required.', 400);
    if (
      typeof input.sku !== 'string' ||
      input.sku.length > 80 ||
      typeof input.termsVersion !== 'string'
    )
      throw new AppError('Invalid purchase request.', 400);
    const user = await User.findOne({
      _id: input.userId,
      isActive: true,
      isEmailVerified: true,
    }).select('email displayName');
    if (!user)
      throw new AppError('A verified active account is required to purchase credits.', 403);
    const now = new Date();
    await expirePendingPaymentOrders(now);
    const pkg = await BillingPackage.findOne({
      sku: input.sku,
      active: true,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: now } }],
      termsVersion: input.termsVersion,
    });
    if (!pkg || pkg.sku === 'welcome.v1' || pkg.amountIdr <= 0 || !Number.isInteger(pkg.amountIdr))
      throw new AppError('Package or terms version is unavailable.', 409);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ sku: pkg.sku, version: pkg.version, terms: pkg.termsVersion }))
      .digest('hex');
    const existing = await PaymentOrder.findOne({
      userId: user._id,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint)
        throw new AppError('Idempotency-Key was used for a different purchase.', 409);
      return {
        orderId: String(existing._id),
        orderNumber: existing.publicOrderNumber,
        checkoutUrl: existing.checkoutUrl,
        paymentStatus: existing.paymentStatus,
      };
    }
    const reference = `landly_${randomUUID().replace(/-/g, '')}`;
    const checkoutUrl = lynkAdapter.createOrderUrl({
      productId: pkg.lynkProductId || '',
      checkoutUrl: pkg.lynkCheckoutUrl || '',
      orderReference: reference,
    });
    const session = await mongoose.startSession();
    let order: any;
    try {
      await session.withTransaction(async () => {
        // Serialize purchase-intent admission for this account so parallel requests cannot exceed the pending cap.
        await BillingWallet.findOneAndUpdate(
          { userId: user._id },
          {
            $setOnInsert: { availableCredits: 0, reservedCredits: 0, billingRiskHold: false },
            $inc: { version: 1 },
          },
          { upsert: true, new: true, session },
        );
        const repeated = await PaymentOrder.findOne({
          userId: user._id,
          idempotencyKey: input.idempotencyKey,
        }).session(session);
        if (repeated) {
          if (repeated.requestFingerprint !== fingerprint)
            throw new AppError('Idempotency-Key was used for a different purchase.', 409);
          order = repeated;
          return;
        }
        if (
          (await PaymentOrder.countDocuments({
            userId: user._id,
            paymentStatus: 'pending',
          }).session(session)) >= 2
        )
          throw new AppError('You already have two pending purchases.', 409);
        order = await PaymentOrder.create(
          [
            {
              userId: user._id,
              buyerEmail: user.email.toLowerCase(),
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: fingerprint,
              publicOrderNumber: reference,
              packageSnapshot: {
                sku: pkg.sku,
                version: pkg.version,
                nameId: pkg.nameId,
                nameEn: pkg.nameEn,
                amountIdr: pkg.amountIdr,
                credits: pkg.credits,
                currency: pkg.currency,
                lynkProductId: pkg.lynkProductId,
              },
              termsVersion: pkg.termsVersion,
              locale: input.locale === 'id' ? 'id' : 'en',
              provider: 'lynk',
              providerEnvironment: 'live',
              checkoutReference: reference,
              checkoutUrl,
              paymentStatus: 'pending',
              fulfillmentStatus: 'pending',
              providerExpiresAt: new Date(now.getTime() + PAYMENT_INTENT_TTL_MS),
            },
          ],
          { session },
        ).then((xs) => xs[0]);
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const repeated = await PaymentOrder.findOne({
        userId: user._id,
        idempotencyKey: input.idempotencyKey,
      });
      if (!repeated || repeated.requestFingerprint !== fingerprint)
        throw new AppError('Idempotency-Key conflicts with another purchase.', 409);
      order = repeated;
    } finally {
      await session.endSession();
    }
    return {
      orderId: String(order._id),
      orderNumber: order.publicOrderNumber,
      checkoutUrl,
      paymentStatus: order.paymentStatus,
      packageSnapshot: order.packageSnapshot,
    };
  },
};
