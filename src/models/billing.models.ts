import mongoose, { Schema } from 'mongoose';

const objectId = Schema.Types.ObjectId;
const nonNegativeInteger = { type: Number, min: 0, validate: Number.isInteger };
const positiveInteger = { type: Number, min: 1, validate: Number.isInteger };
const timestamps = { timestamps: true, autoIndex: false, strict: 'throw' as const };

export interface IBillingPackage extends mongoose.Document {
  sku: string;
  version: number;
  nameId: string;
  nameEn: string;
  descriptionId?: string;
  descriptionEn?: string;
  currency: 'IDR';
  amountIdr: number;
  credits: number;
  active: boolean;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  termsVersion: string;
  lynkProductId?: string;
  lynkCheckoutUrl?: string;
}

export interface IActionCost extends mongoose.Document {
  action: 'cv_review_bundle' | 'ai_draft' | 'job_match_retry';
  version: number;
  creditsRequired: number;
  active: boolean;
}

export interface IBillingWallet extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  availableCredits: number;
  reservedCredits: number;
  version: number;
  billingRiskHold: boolean;
}

export interface ICreditLot extends mongoose.Document {
  createdAt: Date;
  userId: mongoose.Types.ObjectId;
  sourceType: 'trial' | 'purchase' | 'goodwill' | 'internal';
  sourceId: string;
  grantKey: string;
  granted: number;
  available: number;
  reserved: number;
  consumed: number;
  revoked: number;
  expiresAt: Date | null;
}

export interface ICreditReservation extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  kind: 'ai_operation' | 'money_refund';
  referenceId: mongoose.Types.ObjectId;
  reservationKey: string;
  totalCredits: number;
  allocations: Array<{ lotId: mongoose.Types.ObjectId; credits: number }>;
  status: 'held' | 'captured' | 'partially_captured' | 'released' | 'revoked';
  capturedCredits?: number;
  releasedCredits?: number;
}

export interface ICreditLedger extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  eventKey: string;
  eventType: string;
  deltaAvailable: number;
  deltaReserved: number;
  deltaConsumed: number;
  deltaRevoked: number;
  creditsGrantedDelta: number;
  reasonCode: string;
  actorType: 'system' | 'user' | 'admin';
  actorId?: mongoose.Types.ObjectId;
  policyVersion: string;
  createdAt: Date;
}

export interface IAiOperation extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  action: 'cv_review_bundle' | 'ai_draft' | 'job_match_retry';
  status: 'queued' | 'running' | 'completed' | 'completed_partial' | 'failed' | 'cancelled';
  billingMode: 'credits' | 'sponsored';
  costSnapshot: Record<string, unknown>;
  reservationId?: mongoose.Types.ObjectId;
  resourceId?: mongoose.Types.ObjectId;
  resultId?: mongoose.Types.ObjectId;
  leaseUntil?: Date;
  workerToken?: string;
  locale: string;
  inputFingerprint: string;
  inputSnapshotRef: string;
  inputSnapshot?: Record<string, unknown>;
  clientIntentKey?: string;
  attemptCount: number;
  maxAttempts: number;
  stateVersion: number;
  failureCode?: string;
  completedAt?: Date;
}

const BillingPackageSchema = new Schema({
  sku: { type: String, required: true, trim: true, maxlength: 80 },
  version: { ...positiveInteger, required: true },
  nameId: { type: String, required: true, maxlength: 120 },
  nameEn: { type: String, required: true, maxlength: 120 },
  descriptionId: { type: String, trim: true, maxlength: 300, default: '' },
  descriptionEn: { type: String, trim: true, maxlength: 300, default: '' },
  currency: { type: String, required: true, enum: ['IDR'], default: 'IDR' },
  amountIdr: { ...nonNegativeInteger, required: true },
  credits: { ...positiveInteger, required: true },
  active: { type: Boolean, required: true, default: false },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: Date,
  termsVersion: { type: String, required: true, maxlength: 80 },
  lynkProductId: { type: String, maxlength: 180 },
  lynkCheckoutUrl: { type: String, maxlength: 2000, match: /^https:\/\/lynk\.id\// },
}, timestamps);
BillingPackageSchema.index({ sku: 1, version: 1 }, { unique: true, name: 'sku_version_unique' });
BillingPackageSchema.index(
  { sku: 1 },
  { unique: true, name: 'sku_active_unique', partialFilterExpression: { active: true } },
);
BillingPackageSchema.index({ active: 1, effectiveFrom: 1 }, { name: 'active_effective_from' });
BillingPackageSchema.index({ lynkProductId: 1 }, { unique: true, partialFilterExpression: { lynkProductId: { $type: 'string' } }, name: 'lynk_product_unique' });

const ActionCostSchema = new Schema({
  action: { type: String, required: true, enum: ['cv_review_bundle', 'ai_draft', 'job_match_retry'] },
  version: { ...positiveInteger, required: true },
  creditsRequired: { ...positiveInteger, required: true },
  active: { type: Boolean, required: true, default: false },
}, timestamps);
ActionCostSchema.index({ action: 1, version: 1 }, { unique: true, name: 'action_version_unique' });
ActionCostSchema.index(
  { action: 1 },
  { unique: true, name: 'action_active_unique', partialFilterExpression: { active: true } },
);

const BillingWalletSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  availableCredits: { ...nonNegativeInteger, required: true, default: 0 },
  reservedCredits: { ...nonNegativeInteger, required: true, default: 0 },
  version: { ...nonNegativeInteger, required: true, default: 0 },
  billingRiskHold: { type: Boolean, required: true, default: false },
}, timestamps);
BillingWalletSchema.index({ userId: 1 }, { unique: true, name: 'user_unique' });

const CreditLotSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  sourceType: { type: String, required: true, enum: ['trial', 'purchase', 'goodwill', 'internal'] },
  sourceId: { type: String, required: true, maxlength: 128 },
  grantKey: { type: String, required: true, maxlength: 180 },
  packageSnapshot: { type: Schema.Types.Mixed },
  granted: { ...nonNegativeInteger, required: true },
  available: { ...nonNegativeInteger, required: true },
  reserved: { ...nonNegativeInteger, required: true },
  consumed: { ...nonNegativeInteger, required: true },
  revoked: { ...nonNegativeInteger, required: true },
  expiresAt: { type: Date, default: null },
}, timestamps);
CreditLotSchema.pre('validate', function validateLotInvariant(next) {
  const lot = this as typeof this & { granted: number; available: number; reserved: number; consumed: number; revoked: number };
  if ([lot.granted, lot.available, lot.reserved, lot.consumed, lot.revoked].every(Number.isInteger) &&
      lot.granted !== lot.available + lot.reserved + lot.consumed + lot.revoked) {
    next(new Error('Credit lot invariant violated.'));
    return;
  }
  next();
});
CreditLotSchema.index({ grantKey: 1 }, { unique: true, name: 'grant_key_unique' });
CreditLotSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_created_at' });

const CreditReservationSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  kind: { type: String, required: true, enum: ['ai_operation', 'money_refund'] },
  referenceId: { type: objectId, required: true },
  reservationKey: { type: String, required: true, maxlength: 180 },
  costVersion: positiveInteger,
  totalCredits: { ...positiveInteger, required: true },
  allocations: [{
    lotId: { type: objectId, ref: 'CreditLot', required: true },
    credits: { ...positiveInteger, required: true },
  }],
  status: { type: String, required: true, enum: ['held', 'captured', 'partially_captured', 'released', 'revoked'], default: 'held' },
  capturedCredits: nonNegativeInteger,
  releasedCredits: nonNegativeInteger,
  leaseExpiresAt: Date,
  finalizedAt: Date,
}, timestamps);
CreditReservationSchema.index({ reservationKey: 1 }, { unique: true, name: 'reservation_key_unique' });
CreditReservationSchema.index({ userId: 1, status: 1, createdAt: -1 }, { name: 'user_status_created_at' });

const CreditLedgerSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  eventKey: { type: String, required: true, maxlength: 180 },
  eventType: {
    type: String, required: true,
    enum: ['grant_trial', 'grant_purchase', 'reserve_ai', 'capture_ai', 'release_ai', 'reserve_refund', 'release_refund', 'revoke_refund', 'grant_goodwill', 'revoke_reversal'],
  },
  lotId: { type: objectId, ref: 'CreditLot' },
  reservationId: { type: objectId, ref: 'CreditReservation' },
  operationId: { type: objectId, ref: 'AiOperation' },
  orderId: { type: objectId, ref: 'PaymentOrder' },
  refundId: { type: objectId, ref: 'RefundRequest' },
  deltaAvailable: { type: Number, required: true, validate: Number.isInteger },
  deltaReserved: { type: Number, required: true, validate: Number.isInteger },
  deltaConsumed: { type: Number, required: true, validate: Number.isInteger },
  deltaRevoked: { type: Number, required: true, validate: Number.isInteger },
  creditsGrantedDelta: { type: Number, required: true, validate: Number.isInteger },
  reasonCode: { type: String, required: true, maxlength: 80 },
  actorType: { type: String, required: true, enum: ['system', 'user', 'admin'] },
  actorId: { type: objectId, ref: 'User' },
  policyVersion: { type: String, required: true, maxlength: 80 },
}, { ...timestamps, timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
CreditLedgerSchema.index({ eventKey: 1 }, { unique: true, name: 'event_key_unique' });
CreditLedgerSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_created_at' });
CreditLedgerSchema.index({ operationId: 1, eventType: 1 }, { name: 'operation_event_type' });
CreditLedgerSchema.pre('save', function preventLedgerUpdates() {
  if (!this.isNew) throw new Error('Credit ledger is append-only.');
});
CreditLedgerSchema.pre('deleteOne', { document: true, query: false }, function preventLedgerDocumentDelete() {
  throw new Error('Credit ledger is append-only.');
});
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany'] as const) {
  CreditLedgerSchema.pre(operation, function preventLedgerMutation() {
    throw new Error('Credit ledger is append-only.');
  });
}

const AiOperationSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  action: { type: String, required: true, enum: ['cv_review_bundle', 'ai_draft', 'job_match_retry'] },
  status: {
    type: String, required: true,
    enum: ['queued', 'running', 'completed', 'completed_partial', 'failed', 'cancelled'],
    default: 'queued',
  },
  billingMode: { type: String, required: true, enum: ['credits', 'sponsored'] },
  costSnapshot: { type: Schema.Types.Mixed, required: true },
  reservationId: { type: objectId, ref: 'CreditReservation' },
  resourceId: { type: objectId },
  resultId: { type: objectId, ref: 'AiOperationResult' },
  locale: { type: String, required: true, maxlength: 16 },
  inputFingerprint: { type: String, required: true, minlength: 64, maxlength: 64 },
  inputSnapshotRef: { type: String, required: true, maxlength: 180 },
  inputSnapshot: { type: Schema.Types.Mixed, select: false },
  clientIntentKey: { type: String, maxlength: 180 },
  stageStates: { type: Schema.Types.Mixed, default: {} },
  attemptCount: { ...nonNegativeInteger, required: true, default: 0 },
  maxAttempts: { ...positiveInteger, required: true },
  leaseUntil: Date,
  workerToken: { type: String, maxlength: 180 },
  stateVersion: { ...nonNegativeInteger, required: true, default: 0 },
  failureCode: { type: String, maxlength: 80 },
  completedAt: Date,
}, timestamps);
AiOperationSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_created_at' });
AiOperationSchema.index({ status: 1, leaseUntil: 1 }, { name: 'status_lease_until' });
AiOperationSchema.index(
  { userId: 1, clientIntentKey: 1 },
  { unique: true, name: 'user_client_intent_unique', partialFilterExpression: { clientIntentKey: { $type: 'string' } } },
);

const AiOperationResultSchema = new Schema({
  operationId: { type: objectId, ref: 'AiOperation', required: true },
  userId: { type: objectId, ref: 'User', required: true },
  resultData: { type: Schema.Types.Mixed, required: true, select: false },
  schemaVersion: { ...positiveInteger, required: true },
  source: { type: String, required: true, enum: ['ai_draft', 'review'] },
  state: { type: String, required: true, enum: ['available', 'applied', 'deleted', 'expired'], default: 'available' },
  appliedDraftVersion: { type: Number, min: 0, validate: Number.isInteger },
  expiresAt: Date,
  reminderSentAt: Date,
}, timestamps);
AiOperationResultSchema.index({ operationId: 1 }, { unique: true, name: 'operation_unique' });
AiOperationResultSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_created_at' });
AiOperationResultSchema.index({ state: 1, expiresAt: 1 }, { name: 'state_expires_at' });

const PaymentOrderSchema = new Schema({
  userId: { type: objectId, ref: 'User' },
  buyerEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  idempotencyKey: { type: String, required: true, maxlength: 180 },
  requestFingerprint: { type: String, required: true, minlength: 64, maxlength: 64 },
  publicOrderNumber: { type: String, required: true, maxlength: 100 },
  packageSnapshot: { type: Schema.Types.Mixed, required: true },
  termsVersion: { type: String, required: true, maxlength: 80 },
  locale: { type: String, required: true, maxlength: 16 },
  provider: { type: String, required: true, maxlength: 40 },
  providerEnvironment: { type: String, required: true, enum: ['test', 'live'] },
  providerOrderId: { type: String, maxlength: 180 },
  providerTransactionId: { type: String, maxlength: 180 },
  checkoutReference: { type: String, select: false, maxlength: 500 },
  checkoutUrl: { type: String, maxlength: 2000 },
  providerExpiresAt: Date,
  isTestPayment: { type: Boolean, default: false },
  paymentStatus: { type: String, required: true, enum: ['pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'disputed'], default: 'pending' },
  fulfillmentStatus: { type: String, required: true, enum: ['pending', 'granted', 'reconciliation_required'], default: 'pending' },
  confirmedPaidAmountIdr: { type: Number, min: 0, validate: Number.isInteger },
  paidAt: Date,
  creditGrantedAt: Date,
  returnIntentId: { type: String, maxlength: 180 },
  riskState: { type: String, maxlength: 80 },
  webhookFingerprint: { type: String, minlength: 64, maxlength: 64 },
}, timestamps);
PaymentOrderSchema.index({ publicOrderNumber: 1 }, { unique: true, name: 'public_order_number_unique' });
PaymentOrderSchema.index(
  { provider: 1, providerEnvironment: 1, providerOrderId: 1 },
  { unique: true, name: 'provider_order_unique', partialFilterExpression: { providerOrderId: { $type: 'string' } } },
);
PaymentOrderSchema.index(
  { provider: 1, providerEnvironment: 1, providerTransactionId: 1 },
  { unique: true, name: 'provider_transaction_unique', partialFilterExpression: { providerTransactionId: { $type: 'string' } } },
);
PaymentOrderSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_created_at' });
PaymentOrderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: 'user_idempotency_unique' });
PaymentOrderSchema.index({ buyerEmail: 1, paymentStatus: 1, fulfillmentStatus: 1 }, { name: 'email_claim_lookup' });
PaymentOrderSchema.index({ paymentStatus: 1, updatedAt: 1 }, { name: 'payment_status_updated_at' });

const WebhookInboxSchema = new Schema({
  provider: { type: String, required: true, maxlength: 40 },
  eventIdentity: { type: String, required: true, maxlength: 180 },
  orderReference: { type: String, maxlength: 180 },
  schemaVersion: { type: String, maxlength: 80 },
  signatureStatus: { type: String, required: true, enum: ['verified', 'invalid', 'unavailable'] },
  sanitizedPayload: { type: Schema.Types.Mixed, select: false },
  rawPayloadHash: { type: String, required: true, minlength: 64, maxlength: 64 },
  processState: { type: String, required: true, enum: ['received', 'processing', 'processed', 'rejected', 'retry'], default: 'received' },
  retryCount: { ...nonNegativeInteger, required: true, default: 0 },
  receivedAt: { type: Date, required: true, default: Date.now },
  processedAt: Date,
}, { ...timestamps, strict: 'throw' });
WebhookInboxSchema.index({ provider: 1, eventIdentity: 1 }, { unique: true, name: 'provider_event_unique' });
WebhookInboxSchema.index({ processState: 1, receivedAt: 1 }, { name: 'state_received_at' });

const OutboxEventSchema = new Schema({
  eventKey: { type: String, required: true, maxlength: 180 },
  type: { type: String, required: true, maxlength: 100 },
  entityId: { type: objectId, required: true },
  payload: { type: Schema.Types.Mixed, required: true, select: false },
  state: { type: String, required: true, enum: ['pending', 'processing', 'delivered', 'failed'], default: 'pending' },
  attempts: { ...nonNegativeInteger, required: true, default: 0 },
  nextAttemptAt: { type: Date, required: true, default: Date.now },
  lockedUntil: Date,
  deliveredAt: Date,
}, timestamps);
OutboxEventSchema.index({ eventKey: 1 }, { unique: true, name: 'event_key_unique' });
OutboxEventSchema.index({ state: 1, nextAttemptAt: 1 }, { name: 'state_next_attempt_at' });

const IdempotencyRecordSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  scope: { type: String, required: true, maxlength: 100 },
  key: { type: String, required: true, maxlength: 180 },
  requestFingerprint: { type: String, required: true, minlength: 64, maxlength: 64 },
  resourceId: { type: objectId, required: true },
  outcome: { type: String, required: true, enum: ['accepted', 'completed', 'conflict'] },
  expiresAt: Date,
}, timestamps);
IdempotencyRecordSchema.index({ userId: 1, scope: 1, key: 1 }, { unique: true, name: 'user_scope_key_unique' });
IdempotencyRecordSchema.index({ expiresAt: 1 }, { name: 'expires_at' });

const RefundRequestSchema = new Schema({
  orderId: { type: objectId, ref: 'PaymentOrder', required: true },
  userId: { type: objectId, ref: 'User', required: true },
  requestedAmountIdr: { ...positiveInteger, required: true },
  approvedAmountIdr: { type: Number, min: 1, validate: Number.isInteger },
  allocatedLots: [{ lotId: { type: objectId, ref: 'CreditLot', required: true }, credits: { ...positiveInteger, required: true } }],
  refundReservationId: { type: objectId, ref: 'CreditReservation' },
  providerRefundId: { type: String, maxlength: 180 },
  reasonCode: { type: String, required: true, maxlength: 80 },
  state: { type: String, required: true, enum: ['requested', 'approved', 'submitted', 'confirmed', 'rejected', 'reconciliation_required'], default: 'requested' },
  actorId: { type: objectId, ref: 'User' },
  requestedAt: { type: Date, required: true, default: Date.now },
  confirmedAt: Date,
}, timestamps);
RefundRequestSchema.index({ orderId: 1, createdAt: -1 }, { name: 'order_created_at' });
RefundRequestSchema.index({ userId: 1, state: 1, createdAt: -1 }, { name: 'user_state_created_at' });
RefundRequestSchema.index(
  { providerRefundId: 1 },
  { unique: true, name: 'provider_refund_unique', partialFilterExpression: { providerRefundId: { $type: 'string' } } },
);

const models = [
  ['BillingPackage', BillingPackageSchema, 'billing_packages'],
  ['ActionCost', ActionCostSchema, 'action_costs'],
  ['BillingWallet', BillingWalletSchema, 'billing_wallets'],
  ['CreditLot', CreditLotSchema, 'credit_lots'],
  ['CreditReservation', CreditReservationSchema, 'credit_reservations'],
  ['CreditLedger', CreditLedgerSchema, 'credit_ledger'],
  ['AiOperation', AiOperationSchema, 'ai_operations'],
  ['AiOperationResult', AiOperationResultSchema, 'ai_operation_results'],
  ['PaymentOrder', PaymentOrderSchema, 'payment_orders'],
  ['WebhookInbox', WebhookInboxSchema, 'webhook_inbox'],
  ['OutboxEvent', OutboxEventSchema, 'outbox_events'],
  ['IdempotencyRecord', IdempotencyRecordSchema, 'idempotency_records'],
  ['RefundRequest', RefundRequestSchema, 'refund_requests'],
] as const;

const registeredModels = models.map(([name, schema, collection]) =>
  mongoose.models[name] || mongoose.model(name, schema, collection),
);

export const BillingPackage = registeredModels[0] as mongoose.Model<IBillingPackage>;
export const ActionCost = registeredModels[1] as mongoose.Model<IActionCost>;
export const BillingWallet = registeredModels[2] as mongoose.Model<IBillingWallet>;
export const CreditLot = registeredModels[3] as mongoose.Model<ICreditLot>;
export const CreditReservation = registeredModels[4] as mongoose.Model<ICreditReservation>;
export const CreditLedger = registeredModels[5] as mongoose.Model<ICreditLedger>;
export const AiOperation = registeredModels[6] as mongoose.Model<IAiOperation>;
export const AiOperationResult = registeredModels[7];
export const PaymentOrder = registeredModels[8];
export const WebhookInbox = registeredModels[9];
export const OutboxEvent = registeredModels[10];
export const IdempotencyRecord = registeredModels[11];
export const RefundRequest = registeredModels[12];
export const billingModels = registeredModels;

export const billingModelIndexPlan = models.map(([name, schema, collection]) => ({
  model: name,
  collection,
  indexes: schema.indexes(),
}));
