import mongoose from 'mongoose';
import config from '../../../config/config';
import { AppError } from '../../../middlewares/error.middleware';
import { PaymentOrder, OutboxEvent } from '../../../models/billing.models';
import User from '../../../models/user.model';
import AdminAuditLog from '../../../models/adminAuditLog.model';
import { grantInTransaction } from '../billing.service';

/** Temporary admin test tool. Uses the real credit grant, but records zero cash received. */
export async function markTestPaymentPaid(orderId: string, actorId: string, reason: string) {
  if (!config.billing.adminTestPaymentsEnabled)
    throw new AppError('Test payments are disabled.', 403);
  if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(actorId))
    throw new AppError('Invalid payment or administrator ID.', 400);
  if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 300)
    throw new AppError('Enter a test reason between 10 and 300 characters.', 400);
  const session = await mongoose.startSession();
  let result!: { orderId: string; reused: boolean; credits: number };
  try {
    await session.withTransaction(async () => {
      const order = await PaymentOrder.findById(orderId).session(session);
      if (!order) throw new AppError('Payment not found.', 404);
      const snapshot = order.packageSnapshot as { credits: number };
      if (
        order.isTestPayment &&
        order.paymentStatus === 'paid' &&
        order.fulfillmentStatus === 'granted'
      ) {
        result = { orderId: String(order._id), reused: true, credits: snapshot.credits };
        return;
      }
      if (
        order.paymentStatus !== 'pending' ||
        order.fulfillmentStatus !== 'pending' ||
        !order.userId
      )
        throw new AppError(
          'Only an unpaid pending order linked to a user can be marked as a test payment.',
          409,
        );
      if (!Number.isSafeInteger(snapshot.credits) || snapshot.credits < 1)
        throw new AppError('The order credit snapshot is invalid.', 409);
      const user = await User.findOne({
        _id: order.userId,
        isActive: true,
        isEmailVerified: true,
      }).session(session);
      if (!user) throw new AppError('The order must belong to an active verified account.', 409);
      const now = new Date();
      order.isTestPayment = true;
      order.paymentStatus = 'paid';
      order.fulfillmentStatus = 'granted';
      order.confirmedPaidAmountIdr = 0;
      order.paidAt = now;
      order.creditGrantedAt = now;
      await order.save({ session });
      await grantInTransaction({
        userId: user._id,
        amount: snapshot.credits,
        sourceType: 'purchase',
        sourceId: String(order._id),
        grantKey: `grant:order:${order._id}`,
        actorType: 'admin',
        actorId: new mongoose.Types.ObjectId(actorId),
        reasonCode: 'admin_test_payment',
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
            nextAttemptAt: now,
          },
        },
        { upsert: true, session },
      );
      await AdminAuditLog.create(
        [
          {
            actorUserId: actorId,
            action: 'billing.payment.test_paid',
            targetType: 'payment_order',
            targetId: String(order._id),
            details: {
              reason: reason.trim(),
              isTestPayment: true,
              confirmedPaidAmountIdr: 0,
              credits: snapshot.credits,
            },
          },
        ],
        { session },
      );
      result = { orderId: String(order._id), reused: false, credits: snapshot.credits };
    });
    return result;
  } finally {
    await session.endSession();
  }
}
