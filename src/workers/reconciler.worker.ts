import { AiOperation, PaymentOrder } from '../models/billing.models';
import { processReceivedLynk } from '../features/billing/webhooks/webhook.processor';
import appLogger from '../utils/logger';
import { expirePendingPaymentOrders } from '../features/billing/orders/order.service';

const logger = appLogger.child({ scope: 'billing-reconciler' });

export async function runLocalBillingReconciliation(now = new Date()): Promise<{ processedEvents: boolean; paidPending: number; stuckOperations: number; cancelledOrders: number }> {
  // Reprocess only durable local inbox records. This worker never calls Lynk APIs.
  await processReceivedLynk(50);
  const threshold = new Date(now.getTime() - 10 * 60_000);
  const [paidPending, stuckOperations, cancelledOrders] = await Promise.all([
    PaymentOrder.countDocuments({ paymentStatus: 'paid', fulfillmentStatus: 'pending', userId: { $ne: null }, updatedAt: { $lte: threshold } }),
    AiOperation.countDocuments({ status: 'running', leaseUntil: { $lte: now } }),
    expirePendingPaymentOrders(now),
  ]);
  if (cancelledOrders) logger.info('Expired unpaid Lynk checkout intents', { cancelledOrders });
  if (paidPending || stuckOperations) logger.warn('Local billing reconciliation found records needing attention', { paidPending, stuckOperations });
  return { processedEvents: true, paidPending, stuckOperations, cancelledOrders };
}

export class LocalBillingReconciler {
  private timer?: NodeJS.Timeout;
  private running = false;
  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref();
    void this.run();
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    while (this.running) await new Promise(resolve => setTimeout(resolve, 25));
  }
  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { await runLocalBillingReconciliation(); }
    catch (error) { logger.error('Local billing reconciliation failed', { error }); }
    finally { this.running = false; }
  }
}

export const localBillingReconciler = new LocalBillingReconciler();
