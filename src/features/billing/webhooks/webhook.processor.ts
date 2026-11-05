import mongoose from 'mongoose';
import {
  BillingPackage,
  CreditLot,
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
    event.reference &&
    (await PaymentOrder.exists({ provider: 'lynk', providerTransactionId: event.reference }))
  )
    return logMismatch(inbox, 'LYNK_REFERENCE_ALREADY_PROCESSED');
  if (
    !event ||
    event.action !== 'SUCCESS' ||
    event.code !== '0' ||
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
  const orderIdentity = {
    buyerEmail: event.buyerEmail,
    'packageSnapshot.sku': pkg.sku,
    'packageSnapshot.version': pkg.version,
  };
  const referencedOrder = await PaymentOrder.findOne({
    publicOrderNumber: event.reference,
    ...orderIdentity,
    paymentStatus: 'pending',
  });
  let candidates = referencedOrder
    ? [referencedOrder]
    : await PaymentOrder.find({ ...orderIdentity, paymentStatus: 'pending' })
        .sort({ createdAt: 1 })
        .limit(2);
  // Lynk's fixed product checkout cannot carry Landly's local order ID. If the buyer pays
  // after the local 30-minute window, still honor a uniquely identifiable verified payment.
  if (!candidates.length)
    candidates = await PaymentOrder.find({ ...orderIdentity, paymentStatus: 'cancelled' })
      .sort({ createdAt: -1 })
      .limit(2);
  if (candidates.length !== 1)
    return logMismatch(inbox, candidates.length ? 'LYNK_ORDER_AMBIGUOUS' : 'LYNK_ORDER_NOT_FOUND');
  const order = candidates[0];
  const user = await User.findOne({
    email: event.buyerEmail,
    isActive: true,
    isEmailVerified: true,
  }).select('_id');
  if (!user) {
    await PaymentOrder.updateOne(
      { _id: order._id, paymentStatus: { $in: ['pending', 'cancelled'] } },
      {
        $set: {
          paymentStatus: 'paid',
          confirmedPaidAmountIdr: event.amountIdr,
          paidAt: new Date(),
          providerTransactionId: event.reference,
          webhookFingerprint: event.fingerprint,
          fulfillmentStatus: 'pending',
          userId: null,
        },
      },
    );
    await WebhookInbox.updateOne(
      { _id: inbox._id },
      { $set: { processState: 'processed', processedAt: new Date() } },
    );
    return;
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fresh = await PaymentOrder.findOne({
        _id: order._id,
        paymentStatus: { $in: ['pending', 'cancelled'] },
      }).session(session);
      if (!fresh) return;
      fresh.userId = user._id;
      fresh.paymentStatus = 'paid';
      fresh.fulfillmentStatus = 'granted';
      fresh.confirmedPaidAmountIdr = event.amountIdr;
      fresh.paidAt = new Date();
      fresh.creditGrantedAt = new Date();
      fresh.providerTransactionId = event.reference;
      fresh.webhookFingerprint = event.fingerprint;
      await fresh.save({ session });
      await grantInTransaction({
        userId: user._id,
        amount: pkg.credits,
        sourceType: 'purchase',
        sourceId: String(fresh._id),
        grantKey: `grant:order:${fresh._id}`,
        actorType: 'system',
        reasonCode: 'lynk_purchase',
        session,
      });
      await OutboxEvent.updateOne(
        { eventKey: `email.purchase_receipt:${fresh._id}` },
        {
          $setOnInsert: {
            eventKey: `email.purchase_receipt:${fresh._id}`,
            type: 'email.purchase_receipt',
            entityId: fresh._id,
            payload: { orderId: String(fresh._id) },
            state: 'pending',
            attempts: 0,
            nextAttemptAt: new Date(),
          },
        },
        { upsert: true, session },
      );
      await WebhookInbox.updateOne(
        { _id: inbox._id },
        { $set: { processState: 'processed', processedAt: new Date() } },
        { session },
      );
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const prior = await CreditLot.findOne({ grantKey: `grant:order:${order._id}` });
      if (prior) {
        await WebhookInbox.updateOne(
          { _id: inbox._id },
          { $set: { processState: 'processed', processedAt: new Date() } },
        );
        return;
      }
    }
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
