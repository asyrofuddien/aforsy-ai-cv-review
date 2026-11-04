import { AiOperation, OutboxEvent, PaymentOrder } from '../../../models/billing.models';
import User from '../../../models/user.model';
import { sendPurchaseReceiptEmail, sendReviewCompleteEmail } from '../../auth/email.adapter';
import Evaluation from '../../../models/evaluation.model';

export async function deliverBillingEmail(event: any): Promise<void> {
  const payload = (event.payload || {}) as Record<string, any>;
  if (event.type === 'email.purchase_receipt') {
    const order: any = await PaymentOrder.findById(payload.orderId || event.entityId).lean();
    if (!order || !order.userId) return;
    const user = await User.findById(order.userId).select('email displayName').lean() as any;
    if (!user) return;
    const snapshot = order.packageSnapshot as any;
    await sendPurchaseReceiptEmail({ email: user.email, displayName: user.displayName || user.email, orderNumber: order.publicOrderNumber, packageName: snapshot.nameId || snapshot.nameEn, amountIdr: order.confirmedPaidAmountIdr || snapshot.amountIdr, credits: snapshot.credits, locale: order.locale === 'id' ? 'id' : 'en' });
    return;
  }
  if (event.type === 'email.result_ready') {
    const operation = await AiOperation.findById(payload.operationId || event.entityId).select('resourceId action locale userId').lean() as any;
    if (!operation || operation.action !== 'cv_review_bundle' || !operation.resourceId) return;
    const [user, evaluation] = await Promise.all([User.findById(operation.userId).select('email displayName').lean() as any, Evaluation.findById(operation.resourceId).select('candidateName').lean() as any]);
    if (user) await sendReviewCompleteEmail({ email: user.email, displayName: user.displayName || user.email, evaluationId: String(operation.resourceId), candidateName: evaluation?.candidateName, locale: operation.locale === 'id' ? 'id' : 'en' });
    return;
  }
  // Partial and terminal email types are durable and retried, but currently intentionally do not send
  // until product copy and recipient behavior are approved.
}

export async function processEmailOutboxEvent(eventId: string): Promise<void> {
  const event = await OutboxEvent.findById(eventId).select('+payload');
  if (!event) return;
  await deliverBillingEmail(event);
}
