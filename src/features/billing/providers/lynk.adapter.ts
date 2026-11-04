import { createHash, timingSafeEqual } from 'crypto';
import config from '../../../config/config';
import { PaymentProvider, LynkPaymentEvent } from './payment-provider.interface';
import { AppError } from '../../../middlewares/error.middleware';

const asRecord = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const int = (value: unknown, field: string): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new AppError(`Invalid Lynk ${field}.`, 400);
  return n;
};

export class LynkAdapter implements PaymentProvider {
  createOrderUrl(input: { productId: string; checkoutUrl: string; orderReference: string }): string {
    if (!/^https:\/\/lynk\.id\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(input.checkoutUrl)) throw new AppError('Lynk checkout URL is not allowlisted.', 503);
    if (!input.productId || !input.orderReference) throw new AppError('Lynk product mapping is incomplete.', 503);
    // Lynk product pages are fixed URLs; the local reference is correlated by buyer email + receipt payload.
    return input.checkoutUrl;
  }

  verifyWebhookSignature(payload: unknown, signature: string | undefined): boolean {
    const key = config.billing.lynkMerchantKey;
    if (!key || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const root = asRecord(payload);
    const data = asRecord(root.data);
    const md = asRecord(data.message_data);
    const totals = asRecord(md.totals);
    const ref = typeof md.refId === 'string' ? md.refId : '';
    const messageId = typeof data.message_id === 'string' ? data.message_id : '';
    const grandTotal = totals.grandTotal;
    if (!ref || !messageId || !Number.isSafeInteger(Number(grandTotal))) return false;
    const expected = createHash('sha256').update(`${grandTotal}${ref}${messageId}${key}`).digest();
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  parseWebhookPayload(payload: unknown): LynkPaymentEvent {
    const root = asRecord(payload);
    const data = asRecord(root.data);
    const md = asRecord(data.message_data);
    const items = Array.isArray(md.items) ? md.items : [];
    const totals = asRecord(md.totals);
    const customer = asRecord(md.customer);
    if (root.event !== 'payment.received' || items.length !== 1) throw new AppError('Unsupported Lynk payment event.', 400);
    const item = asRecord(items[0]);
    const email = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
    const reference = typeof md.refId === 'string' ? md.refId.trim() : '';
    const eventId = typeof data.message_id === 'string' ? data.message_id.trim() : '';
    const productId = typeof item.uuid === 'string' ? item.uuid : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !reference || !eventId || !productId) throw new AppError('Lynk payment identity is incomplete.', 400);
    const numericTotals: Record<string, number> = {};
    for (const key of ['grandTotal', 'customerPay', 'totalItem', 'totalAddon', 'totalShipping', 'discount']) {
      numericTotals[key] = int(totals[key] ?? (key === 'totalAddon' || key === 'totalShipping' || key === 'discount' ? 0 : undefined), `totals.${key}`);
    }
    const normalized = {
      event: root.event, action: data.message_action, code: String(data.message_code), eventId, reference,
      email, productId, priceIdr: int(item.price, 'item.price'), quantity: int(item.qty, 'item.qty'), totals: numericTotals,
    };
    return {
      eventId, reference, amountIdr: numericTotals.grandTotal, buyerEmail: email, productId,
      priceIdr: normalized.priceIdr, quantity: normalized.quantity,
      action: String(data.message_action || ''), code: String(data.message_code ?? ''), totals: numericTotals,
      fingerprint: createHash('sha256').update(JSON.stringify(normalized)).digest('hex'), raw: root,
    };
  }
}

export const lynkAdapter = new LynkAdapter();
