import mongoose from 'mongoose';
import {
  BillingPackage,
  OutboxEvent,
  PaymentOrder,
  WebhookInbox,
} from '../../../models/billing.models';
import User from '../../../models/user.model';
import AdminAuditLog from '../../../models/adminAuditLog.model';
import { grantInTransaction } from '../billing.service';
import config from '../../../config/config';

const logMismatch = async (inbox: any, reason: string) => {
  await WebhookInbox.updateOne(
    { _id: inbox._id },
    { $set: { processState: 'rejected', processedAt: new Date() } },
  );
  await AdminAuditLog.create({
    actorType: 'system',
    action: 'billing.webhook.reconciliation_required',
    targetType: 'payment_order',
    targetId: String(inbox.orderReference || inbox._id),
    details: { reasonCode: reason, provider: 'lynk', eventIdentity: inbox.eventIdentity },
  });
};

export async function processLynkInbox(inboxId: string): Promise<void> {
  const inbox = await WebhookInbox.findOneAndUpdate(
    {
      _id: inboxId,
      provider: 'lynk',
      signatureStatus: 'verified',
      $or: [
        { processState: { $in: ['received', 'retry'] } },
        { processState: 'processing', updatedAt: { $lte: new Date(Date.now() - 2 * 60_000) } },
      ],
    },
    { $set: { processState: 'processing' } },
    { new: true },
  ).select('+sanitizedPayload');
  if (!inbox) return;
  const event = inbox.sanitizedPayload as any;
  if (config.billing.mode !== 'live' || !config.billing.checkoutEnabled)
    return logMismatch(inbox, 'BILLING_LIVE_GATE_DISABLED');
  if (
    !event ||
    event.action !== 'SUCCESS' ||
    event.code !== '0' ||
    !event.reference ||
    !event.totals ||
    event.amountIdr !== event.priceIdr ||
    event.quantity !== 1 ||
    event.totals.totalAddon !== 0 ||
    event.totals.totalShipping !== 0 ||
    event.totals.discount !== 0 ||
    event.totals.totalItem !== event.priceIdr ||
    event.totals.grandTotal !== event.priceIdr ||
    event.totals.customerPay !== event.priceIdr
  )
    return logMismatch(inbox, 'LYNK_TOTALS_OR_STATUS_UNSUPPORTED');
  const pkg = await BillingPackage.findOne({ lynkProductId: event.productId }).lean();
  if (!pkg || pkg.amountIdr !== event.priceIdr)
    return logMismatch(inbox, 'LYNK_PRODUCT_OR_AMOUNT_MISMATCH');
  // A fixed Lynk checkout cannot identify a local intent. Intents with the same
  // buyer and immutable financial terms are interchangeable; the receipt ID is
  // the payment identity. Never use candidate count as evidence of payment count.
  const identity = {
    provider: 'lynk',
    providerEnvironment: 'live',
    buyerEmail: event.buyerEmail,
    'packageSnapshot.sku': pkg.sku,
    'packageSnapshot.version': pkg.version,
    'packageSnapshot.lynkProductId': event.productId,
    'packageSnapshot.amountIdr': event.priceIdr,
    'packageSnapshot.credits': pkg.credits,
    'packageSnapshot.currency': 'IDR',
  };
  const markProcessed = (session: mongoose.ClientSession) =>
    WebhookInbox.updateOne(
      { _id: inbox._id },
      { $set: { processState: 'processed', processedAt: new Date() } },
      { session },
    );
  const session = await mongoose.startSession();
  let rejection: string | undefined;
  try {
    await session.withTransaction(async () => {
      rejection = undefined;
      const prior = await PaymentOrder.findOne({
        provider: 'lynk',
        providerEnvironment: 'live',
        providerTransactionId: event.reference,
      }).session(session);
      if (prior) {
        if (
          prior.buyerEmail !== event.buyerEmail ||
          prior.packageSnapshot.lynkProductId !== event.productId ||
          prior.confirmedPaidAmountIdr !== event.amountIdr
        ) {
          rejection = 'LYNK_REFERENCE_CONFLICT';
          return;
        }
        await markProcessed(session);
        return;
      }
      // Re-select inside every transaction attempt, so concurrent receipts cannot
      // both claim a stale candidate or leave an inbox stuck in processing.
      const eligible = { ...identity, paymentStatus: { $in: ['pending', 'cancelled', 'expired'] } };
      let order = await PaymentOrder.findOne({
        ...eligible,
        publicOrderNumber: event.reference,
      }).session(session);
      if (!order)
        order = await PaymentOrder.findOne({ ...identity, paymentStatus: 'pending' })
          .sort({ createdAt: 1, _id: 1 })
          .session(session);
      if (!order)
        order = await PaymentOrder.findOne({
          ...identity,
          paymentStatus: { $in: ['cancelled', 'expired'] },
        })
          .sort({ createdAt: -1, _id: -1 })
          .session(session);
      if (!order) {
        rejection = 'LYNK_ORDER_NOT_FOUND';
        return;
      }
      const user = await User.findOne({
        email: event.buyerEmail,
        isActive: true,
        isEmailVerified: true,
      })
        .select('_id')
        .session(session);
      order.userId = user?._id || null;
      order.paymentStatus = 'paid';
      order.fulfillmentStatus = user ? 'granted' : 'pending';
      order.confirmedPaidAmountIdr = event.amountIdr;
      order.paidAt = new Date();
      order.providerTransactionId = event.reference;
      order.webhookFingerprint = event.fingerprint;
      if (user) order.creditGrantedAt = new Date();
      await order.save({ session });
      if (user) {
        await grantInTransaction({
          userId: user._id,
          amount: order.packageSnapshot.credits,
          sourceType: 'purchase',
          sourceId: String(order._id),
          grantKey: `grant:order:${order._id}`,
          actorType: 'system',
          reasonCode: 'lynk_purchase',
          session,
        });
        await OutboxEvent.updateOne(
          { eventKey: `email.purchase_receipt:${order._id}` },
          {
            $setOnInsert: {
              eventKey: `email.purchase_receipt:${order._id}`,
              type: 'email.purchase_receipt',
              entityId: order._id,
              payload: { orderId: String(order._id) },
              state: 'pending',
              attempts: 0,
              nextAttemptAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      }
      await markProcessed(session);
    });
    if (rejection) await logMismatch(inbox, rejection);
  } catch (error) {
    // A competing transaction may win a unique receipt ID. Retry through the
    // same transaction path to verify its identity before treating it as replay.
    await WebhookInbox.updateOne(
      { _id: inbox._id },
      { $set: { processState: 'retry' }, $inc: { retryCount: 1 } },
    );
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function processReceivedLynk(limit = 25): Promise<void> {
  const staleProcessing = new Date(Date.now() - 2 * 60_000);
  const inboxes = await WebhookInbox.find({
    provider: 'lynk',
    $or: [
      { processState: { $in: ['received', 'retry'] } },
      { processState: 'processing', updatedAt: { $lte: staleProcessing } },
    ],
  })
    .sort({ receivedAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();
  for (const inbox of inboxes) await processLynkInbox(String(inbox._id));
}
