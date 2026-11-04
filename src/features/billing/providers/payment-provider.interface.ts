export interface LynkPaymentEvent {
  eventId: string;
  reference: string;
  amountIdr: number;
  buyerEmail: string;
  productId: string;
  priceIdr: number;
  quantity: number;
  action: string;
  code: string;
  totals: Record<string, number>;
  fingerprint: string;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  createOrderUrl(input: { productId: string; checkoutUrl: string; orderReference: string }): string;
  verifyWebhookSignature(payload: unknown, signature: string | undefined): boolean;
  parseWebhookPayload(payload: unknown): LynkPaymentEvent;
}
