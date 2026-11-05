import { Request, Response } from 'express';
import { asyncHandler } from '../../../middlewares/error.middleware';
import { WebhookInbox } from '../../../models/billing.models';
import AdminAuditLog from '../../../models/adminAuditLog.model';
import { lynkAdapter } from '../providers/lynk.adapter';

export const receiveLynkWebhook = asyncHandler(async (req: Request, res: Response) => {
  const raw = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
  if (raw > 64 * 1024)
    return res.status(413).json({ success: false, message: 'Webhook payload too large.' });
  let parsed;
  try {
    parsed = lynkAdapter.parseWebhookPayload(req.body);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid Lynk webhook payload.' });
  }
  if (!lynkAdapter.verifyWebhookSignature(req.body, req.header('x-lynk-signature')))
    return res.status(400).json({ success: false, message: 'Invalid Lynk webhook signature.' });
  const rawPayloadHash = parsed.fingerprint;
  try {
    await WebhookInbox.create({
      provider: 'lynk',
      eventIdentity: parsed.eventId,
      orderReference: parsed.reference,
      schemaVersion: 'lynk-v1',
      signatureStatus: 'verified',
      sanitizedPayload: { ...parsed, raw: undefined },
      rawPayloadHash,
      processState: 'received',
      receivedAt: new Date(),
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const existing = await WebhookInbox.findOne({
      provider: 'lynk',
      eventIdentity: parsed.eventId,
    });
    if (existing && existing.rawPayloadHash !== rawPayloadHash) {
      await WebhookInbox.updateOne({ _id: existing._id }, { $set: { processState: 'rejected' } });
      await AdminAuditLog.create({
        actorType: 'system',
        action: 'billing.webhook.identity_conflict',
        targetType: 'payment_order',
        targetId: String(existing.orderReference || existing._id),
        details: {
          provider: 'lynk',
          eventIdentity: parsed.eventId,
          priorPayloadHash: existing.rawPayloadHash,
          conflictingPayloadHash: rawPayloadHash,
        },
      });
    }
  }
  res.status(200).json({ success: true, received: true });
});
