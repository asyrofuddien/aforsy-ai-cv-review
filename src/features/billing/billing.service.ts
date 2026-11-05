import mongoose from 'mongoose';
import { createHash } from 'crypto';
import config from '../../config/config';
import { planCreditSettlement } from './credit-settlement';
import { AppError } from '../../middlewares/error.middleware';
import AdminAuditLog from '../../models/adminAuditLog.model';
import User from '../../models/user.model';
import {
  ActionCost,
  AiOperation,
  BillingPackage,
  BillingWallet,
  CreditLedger,
  CreditLot,
  CreditReservation,
  ICreditLot,
  IdempotencyRecord,
} from '../../models/billing.models';

const POLICY_VERSION = 'credits-v2-matching-split';
const TRIAL_SKU = 'welcome.v1';
const TRIAL_CREDITS = 4;
const MAX_GOODWILL_CREDITS = 5;

type CreditAction = 'cv_review_bundle' | 'ai_draft' | 'job_match_retry';
type GrantSource = 'trial' | 'purchase' | 'goodwill';
type TransactionWork<T> = (_session: mongoose.ClientSession) => Promise<T>;

async function inTransaction<T>(work: TransactionWork<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 20) {
      throw new AppError(
        'MongoDB transactions are unavailable; billing is temporarily disabled.',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function objectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid account or operation ID.', 400);
  return new mongoose.Types.ObjectId(id);
}

function validateIdempotencyKey(key: string): void {
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,180}$/.test(key)) {
    throw new AppError('A valid idempotency key is required.', 400);
  }
}

function validateFingerprint(fingerprint: string): void {
  if (!/^[a-f0-9]{64}$/.test(fingerprint))
    throw new AppError('Invalid operation fingerprint.', 400);
}

async function loadExistingGrant(
  grantKey: string,
  userId: mongoose.Types.ObjectId,
  amount: number,
  sourceType: GrantSource,
  session: mongoose.ClientSession,
  goodwill?: { actorId: mongoose.Types.ObjectId; fingerprint: string },
) {
  const existing = await CreditLot.findOne({ grantKey }).session(session);
  if (!existing) return null;
  if (
    existing.userId.toString() !== userId.toString() ||
    existing.granted !== amount ||
    existing.sourceType !== sourceType
  ) {
    throw new AppError('Idempotency key conflicts with an existing credit grant.', 409);
  }
  if (goodwill) {
    const record = await IdempotencyRecord.findOne({
      userId: goodwill.actorId,
      scope: 'admin_goodwill',
      key: grantKey,
      requestFingerprint: goodwill.fingerprint,
    }).session(session);
    if (!record)
      throw new AppError('Idempotency key conflicts with an existing credit grant.', 409);
  }
  return existing;
}

async function ensureWallet(userId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  return BillingWallet.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: { availableCredits: 0, reservedCredits: 0, version: 0, billingRiskHold: false },
    },
    { upsert: true, new: true, session },
  );
}

export async function grantInTransaction(input: {
  userId: mongoose.Types.ObjectId;
  amount: number;
  sourceType: GrantSource;
  sourceId: string;
  grantKey: string;
  actorType: 'system' | 'admin';
  actorId?: mongoose.Types.ObjectId;
  reasonCode: string;
  session: mongoose.ClientSession;
  goodwill?: { fingerprint: string; caseReference: string; reason: string };
}) {
  const {
    userId,
    amount,
    sourceType,
    sourceId,
    grantKey,
    actorType,
    actorId,
    reasonCode,
    session,
    goodwill,
  } = input;
  const existing = await loadExistingGrant(
    grantKey,
    userId,
    amount,
    sourceType,
    session,
    goodwill && actorId ? { actorId, fingerprint: goodwill.fingerprint } : undefined,
  );
  if (existing) return { lotId: existing.id, granted: false };

  await ensureWallet(userId, session);
  const lot = await CreditLot.create(
    [
      {
        userId,
        sourceType,
        sourceId,
        grantKey,
        packageSnapshot: goodwill ? { caseReference: goodwill.caseReference } : undefined,
        granted: amount,
        available: amount,
        reserved: 0,
        consumed: 0,
        revoked: 0,
        expiresAt: null,
      },
    ],
    { session },
  ).then(([created]) => created);

  const wallet = await BillingWallet.updateOne(
    { userId, billingRiskHold: false },
    { $inc: { availableCredits: amount, version: 1 } },
    { session },
  );
  if (wallet.modifiedCount !== 1)
    throw new AppError('Credit wallet is on hold or unavailable.', 409);

  await CreditLedger.create(
    [
      {
        userId,
        eventKey: grantKey,
        eventType:
          sourceType === 'trial'
            ? 'grant_trial'
            : sourceType === 'purchase'
              ? 'grant_purchase'
              : 'grant_goodwill',
        lotId: lot._id,
        deltaAvailable: amount,
        deltaReserved: 0,
        deltaConsumed: 0,
        deltaRevoked: 0,
        creditsGrantedDelta: amount,
        reasonCode,
        actorType,
        actorId,
        policyVersion: POLICY_VERSION,
      },
    ],
    { session },
  );

  if (goodwill && actorId) {
    await IdempotencyRecord.create(
      [
        {
          userId: actorId,
          scope: 'admin_goodwill',
          key: grantKey,
          requestFingerprint: goodwill.fingerprint,
          resourceId: lot._id,
          outcome: 'completed',
        },
      ],
      { session },
    );
    await AdminAuditLog.create(
      [
        {
          actorUserId: actorId,
          action: 'billing.credit.goodwill_granted',
          targetType: 'billing_wallet',
          targetId: userId.toString(),
          details: {
            caseReference: goodwill.caseReference,
            reason: goodwill.reason,
            credits: amount,
            grantKey,
            policyVersion: POLICY_VERSION,
          },
        },
      ],
      { session },
    );
  }
  return { lotId: lot.id, granted: true };
}

export const billingService = {
  async grantPurchaseInTransaction(input: {
    userId: mongoose.Types.ObjectId;
    amount: number;
    sourceId: string;
    grantKey: string;
    session: mongoose.ClientSession;
  }) {
    return grantInTransaction({
      ...input,
      sourceType: 'purchase',
      actorType: 'system',
      reasonCode: 'lynk_purchase',
    });
  },

  async getActiveCatalog(now = new Date()) {
    const [packages, actionCosts] = await Promise.all([
      BillingPackage.find({
        active: true,
        effectiveFrom: { $lte: now },
        $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: now } }],
      })
        .select(
          'sku version nameId nameEn descriptionId descriptionEn currency amountIdr credits termsVersion lynkProductId',
        )
        .sort({ amountIdr: 1 })
        .lean(),
      ActionCost.find({ active: true })
        .select('action version creditsRequired')
        .sort({ action: 1 })
        .lean(),
    ]);
    return {
      packages,
      actionCosts,
      trialCredits: config.billing.trialEnabled ? TRIAL_CREDITS : 0,
      checkoutAvailable: config.billing.checkoutEnabled && config.billing.mode === 'live',
    };
  },

  async getWallet(userId: string) {
    const ownerId = objectId(userId);
    return inTransaction(async (session) => {
      const wallet = await BillingWallet.findOne({ userId: ownerId }).session(session).lean();
      const [lots, ledgerTotals] = await Promise.all([
        CreditLot.aggregate([
          { $match: { userId: ownerId } },
          {
            $group: {
              _id: null,
              availableCredits: { $sum: '$available' },
              reservedCredits: { $sum: '$reserved' },
              grantedCredits: { $sum: '$granted' },
            },
          },
        ]).session(session),
        CreditLedger.aggregate([
          { $match: { userId: ownerId } },
          {
            $group: {
              _id: null,
              availableCredits: { $sum: '$deltaAvailable' },
              reservedCredits: { $sum: '$deltaReserved' },
              creditsGranted: { $sum: '$creditsGrantedDelta' },
            },
          },
        ]).session(session),
      ]);
      const totals = lots[0] || { availableCredits: 0, reservedCredits: 0, grantedCredits: 0 };
      const ledger = ledgerTotals[0] || {
        availableCredits: 0,
        reservedCredits: 0,
        creditsGranted: 0,
      };
      return {
        wallet: wallet || {
          availableCredits: 0,
          reservedCredits: 0,
          billingRiskHold: false,
          version: 0,
        },
        lots: totals,
        ledger,
        consistent:
          totals.availableCredits === ledger.availableCredits &&
          totals.reservedCredits === ledger.reservedCredits &&
          totals.grantedCredits === ledger.creditsGranted &&
          (wallet
            ? wallet.availableCredits === totals.availableCredits &&
              wallet.reservedCredits === totals.reservedCredits
            : totals.availableCredits === 0 && totals.reservedCredits === 0),
      };
    });
  },

  async listLedger(userId: string, page: number, limit: number) {
    const ownerId = objectId(userId);
    const filter = { userId: ownerId };
    return inTransaction(async (session) => {
      const [records, total] = await Promise.all([
        CreditLedger.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select(
            'eventType deltaAvailable deltaReserved deltaConsumed deltaRevoked creditsGrantedDelta reasonCode policyVersion createdAt',
          )
          .session(session)
          .lean(),
        CreditLedger.countDocuments(filter).session(session),
      ]);
      return { records, total, page, limit, totalPages: Math.ceil(total / limit) };
    });
  },

  async grantWelcomeTrial(userId: string) {
    if (!config.billing.trialEnabled) return { granted: false, disabled: true };
    const ownerId = objectId(userId);
    return inTransaction(async (session) => {
      const user = await User.findOne({
        _id: ownerId,
        isActive: true,
        isEmailVerified: true,
      }).session(session);
      if (!user) throw new AppError('A verified active account is required for the trial.', 403);
      return grantInTransaction({
        userId: ownerId,
        amount: TRIAL_CREDITS,
        sourceType: 'trial',
        sourceId: TRIAL_SKU,
        grantKey: `${TRIAL_SKU}:${ownerId}`,
        actorType: 'system',
        reasonCode: 'welcome_trial',
        session,
      });
    });
  },

  async grantGoodwill(input: {
    actorId: string;
    userId: string;
    credits: number;
    caseReference: string;
    reason: string;
    idempotencyKey: string;
  }) {
    if (!config.billing.adminGrantsEnabled)
      throw new AppError('Admin credit grants are disabled.', 503);
    if (
      !Number.isInteger(input.credits) ||
      input.credits < 1 ||
      input.credits > MAX_GOODWILL_CREDITS
    ) {
      throw new AppError(
        `Goodwill grants must be between 1 and ${MAX_GOODWILL_CREDITS} credits.`,
        400,
      );
    }
    if (
      typeof input.caseReference !== 'string' ||
      !/^[A-Za-z0-9._:-]{3,100}$/.test(input.caseReference)
    ) {
      throw new AppError('A valid support case reference is required.', 400);
    }
    if (
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 10 ||
      input.reason.trim().length > 500
    ) {
      throw new AppError('A reason between 10 and 500 characters is required.', 400);
    }
    validateIdempotencyKey(input.idempotencyKey);
    const actorId = objectId(input.actorId);
    const ownerId = objectId(input.userId);
    const reason = input.reason.trim();
    const grantKey = `goodwill:${actorId}:${createHash('sha256').update(input.idempotencyKey).digest('hex')}`;
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          userId: ownerId.toString(),
          credits: input.credits,
          caseReference: input.caseReference,
          reason,
        }),
      )
      .digest('hex');
    return inTransaction(async (session) => {
      const actor = await User.findOne({ _id: actorId, isActive: true, role: 'admin' }).session(
        session,
      );
      if (!actor) throw new AppError('Administrator access required.', 403);
      const target = await User.findOne({ _id: ownerId, isActive: true }).session(session);
      if (!target) throw new AppError('Active account not found.', 404);
      return grantInTransaction({
        userId: ownerId,
        amount: input.credits,
        sourceType: 'goodwill',
        sourceId: input.caseReference,
        grantKey,
        actorType: 'admin',
        actorId,
        reasonCode: 'support_goodwill',
        session,
        goodwill: { fingerprint, caseReference: input.caseReference, reason },
      });
    });
  },

  async createCreditOperation(input: {
    userId: string;
    action: CreditAction;
    locale: string;
    inputFingerprint: string;
    inputSnapshotRef: string;
    idempotencyKey: string;
    maxAttempts?: number;
    session?: mongoose.ClientSession;
  }) {
    const userId = objectId(input.userId);
    validateIdempotencyKey(input.idempotencyKey);
    validateFingerprint(input.inputFingerprint);
    if (input.locale !== 'id' && input.locale !== 'en')
      throw new AppError('Unsupported operation locale.', 400);
    if (
      typeof input.inputSnapshotRef !== 'string' ||
      !input.inputSnapshotRef ||
      input.inputSnapshotRef.length > 180
    ) {
      throw new AppError('A valid input snapshot reference is required.', 400);
    }
    if (
      input.maxAttempts !== undefined &&
      (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 5)
    ) {
      throw new AppError('maxAttempts must be between 1 and 5.', 400);
    }
    const work = async (session: mongoose.ClientSession) => {
      const existing = await IdempotencyRecord.findOne({
        userId,
        scope: 'ai_operation',
        key: input.idempotencyKey,
      }).session(session);
      if (existing) {
        if (
          existing.scope !== 'ai_operation' ||
          existing.requestFingerprint !== input.inputFingerprint
        ) {
          throw new AppError('Idempotency key was already used with different input.', 409);
        }
        const operation = await AiOperation.findById(existing.resourceId).session(session);
        const reservation = await CreditReservation.findOne({
          referenceId: existing.resourceId,
        }).session(session);
        if (!operation || !reservation)
          throw new AppError('Operation billing record requires reconciliation.', 503);
        if (operation.action !== input.action)
          throw new AppError('Idempotency key was already used for a different action.', 409);
        return { operation, reservation, reused: true };
      }

      const cost = await ActionCost.findOne({ action: input.action, active: true })
        .sort({ version: -1 })
        .session(session);
      if (!cost) throw new AppError('This AI action is not currently available.', 503);
      const wallet = await ensureWallet(userId, session);
      if (wallet.billingRiskHold)
        throw new AppError('Billing is temporarily on hold for this account.', 409);
      if (wallet.availableCredits < cost.creditsRequired)
        throw new AppError('Not enough credits for this action.', 402);

      const lots = await CreditLot.find({ userId, available: { $gt: 0 }, expiresAt: null }).session(
        session,
      );
      const sourcePriority: Record<ICreditLot['sourceType'], number> = {
        trial: 0,
        purchase: 1,
        goodwill: 2,
        internal: 3,
      };
      lots.sort(
        (a, b) =>
          sourcePriority[a.sourceType] - sourcePriority[b.sourceType] ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
      let remaining = cost.creditsRequired;
      const allocations: Array<{ lotId: mongoose.Types.ObjectId; credits: number }> = [];
      for (const lot of lots) {
        const credits = Math.min(remaining, lot.available);
        if (credits > 0) allocations.push({ lotId: lot._id, credits });
        remaining -= credits;
        if (!remaining) break;
      }
      if (remaining) throw new AppError('Credit wallet and lot balances do not reconcile.', 503);

      const operation = await AiOperation.create(
        [
          {
            userId,
            action: input.action,
            status: 'queued',
            billingMode: 'credits',
            costSnapshot: {
              action: input.action,
              version: cost.version,
              creditsRequired: cost.creditsRequired,
              policyVersion: POLICY_VERSION,
              ...(input.action === 'cv_review_bundle' ? { matchingCreditsRequired: 1 } : {}),
            },
            locale: input.locale,
            inputFingerprint: input.inputFingerprint,
            inputSnapshotRef: input.inputSnapshotRef,
            clientIntentKey: input.idempotencyKey,
            attemptCount: 0,
            maxAttempts: input.maxAttempts ?? 3,
            stateVersion: 0,
          },
        ],
        { session },
      ).then(([created]) => created);
      const reservationKey = `ai-operation:${operation.id}`;
      const reservation = await CreditReservation.create(
        [
          {
            userId,
            kind: 'ai_operation',
            referenceId: operation._id,
            reservationKey,
            costVersion: cost.version,
            totalCredits: cost.creditsRequired,
            allocations,
            status: 'held',
          },
        ],
        { session },
      ).then(([created]) => created);

      const walletUpdate = await BillingWallet.updateOne(
        {
          _id: wallet._id,
          availableCredits: { $gte: cost.creditsRequired },
          billingRiskHold: false,
        },
        {
          $inc: {
            availableCredits: -cost.creditsRequired,
            reservedCredits: cost.creditsRequired,
            version: 1,
          },
        },
        { session },
      );
      if (walletUpdate.modifiedCount !== 1)
        throw new AppError('Credit balance changed; please retry.', 409);
      for (const allocation of allocations) {
        const lotUpdate = await CreditLot.updateOne(
          { _id: allocation.lotId, userId, available: { $gte: allocation.credits } },
          { $inc: { available: -allocation.credits, reserved: allocation.credits } },
          { session },
        );
        if (lotUpdate.modifiedCount !== 1)
          throw new AppError('Credit lot changed; please retry.', 409);
        await CreditLedger.create(
          [
            {
              userId,
              eventKey: `${reservationKey}:reserve:${allocation.lotId}`,
              eventType: 'reserve_ai',
              lotId: allocation.lotId,
              reservationId: reservation._id,
              operationId: operation._id,
              deltaAvailable: -allocation.credits,
              deltaReserved: allocation.credits,
              deltaConsumed: 0,
              deltaRevoked: 0,
              creditsGrantedDelta: 0,
              reasonCode: input.action,
              actorType: 'user',
              actorId: userId,
              policyVersion: POLICY_VERSION,
            },
          ],
          { session },
        );
      }
      await IdempotencyRecord.create(
        [
          {
            userId,
            scope: 'ai_operation',
            key: input.idempotencyKey,
            requestFingerprint: input.inputFingerprint,
            resourceId: operation._id,
            outcome: 'accepted',
          },
        ],
        { session },
      );
      operation.reservationId = reservation._id;
      await operation.save({ session });
      return { operation, reservation, reused: false };
    };
    if (input.session) return work(input.session);
    try {
      return await inTransaction(work);
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      // A concurrent request can win the unique idempotency insert after this
      // transaction's initial lookup. Resolve that race as an idempotent replay.
      const existing: any = await IdempotencyRecord.findOne({
        userId,
        scope: 'ai_operation',
        key: input.idempotencyKey,
      }).lean();
      if (!existing) throw error;
      if (existing.requestFingerprint !== input.inputFingerprint) {
        throw new AppError('Idempotency key was already used with different input.', 409);
      }
      const [operation, reservation] = await Promise.all([
        AiOperation.findById(existing.resourceId),
        CreditReservation.findOne({ referenceId: existing.resourceId }),
      ]);
      if (!operation || !reservation || operation.action !== input.action) {
        throw new AppError('Operation billing record requires reconciliation.', 503);
      }
      return { operation, reservation, reused: true };
    }
  },

  async settleCreditOperation(
    operationId: string,
    outcome: 'capture' | 'release' | 'partial',
    failureCode = 'technical_failure',
    externalSession?: mongoose.ClientSession,
  ) {
    if (!/^[a-z0-9_:-]{1,80}$/i.test(failureCode)) throw new AppError('Invalid failure code.', 400);
    const id = objectId(operationId);
    const work = async (session: mongoose.ClientSession) => {
      const operation = await AiOperation.findById(id).session(session);
      if (!operation) throw new AppError('AI operation not found.', 404);
      const reservation = await CreditReservation.findOne({ referenceId: id }).session(session);
      if (!reservation) throw new AppError('Operation reservation not found.', 404);
      const terminalStatus =
        outcome === 'capture'
          ? 'completed'
          : outcome === 'partial'
            ? 'completed_partial'
            : 'failed';
      const reservationStatus =
        outcome === 'capture'
          ? 'captured'
          : outcome === 'partial'
            ? 'partially_captured'
            : 'released';
      if (operation.status === terminalStatus && reservation.status === reservationStatus) {
        return { operationId: operation.id, status: operation.status, settled: false };
      }
      if (operation.status !== 'queued' && operation.status !== 'running') {
        throw new AppError('AI operation is already in a different terminal state.', 409);
      }
      if (reservation.status !== 'held')
        throw new AppError('Credit reservation is already settled.', 409);
      if (
        outcome === 'partial' &&
        (operation.action !== 'cv_review_bundle' || reservation.totalCredits < 2)
      ) {
        throw new AppError('Partial settlement requires a completed CV review bundle.', 409);
      }
      const releasedCredits =
        outcome === 'release' ? reservation.totalCredits : outcome === 'partial' ? 1 : 0;
      const capturedCredits = reservation.totalCredits - releasedCredits;
      const plan = planCreditSettlement(
        reservation.allocations,
        reservation.totalCredits,
        releasedCredits,
      );
      const walletUpdate = await BillingWallet.updateOne(
        { userId: operation.userId, reservedCredits: { $gte: reservation.totalCredits } },
        {
          $inc: {
            availableCredits: releasedCredits,
            reservedCredits: -reservation.totalCredits,
            version: 1,
          },
        },
        { session },
      );
      if (walletUpdate.modifiedCount !== 1)
        throw new AppError('Credit wallet and reservation do not reconcile.', 503);
      for (const allocation of plan) {
        const lotUpdate = await CreditLot.updateOne(
          {
            _id: allocation.lotId,
            userId: operation.userId,
            reserved: { $gte: allocation.credits },
          },
          {
            $inc: {
              reserved: -allocation.credits,
              consumed: allocation.captured,
              available: allocation.released,
            },
          },
          { session },
        );
        if (lotUpdate.modifiedCount !== 1)
          throw new AppError('Credit lot and reservation do not reconcile.', 503);
        for (const entry of [
          { kind: 'capture', amount: allocation.captured },
          { kind: 'release', amount: allocation.released },
        ]) {
          if (!entry.amount) continue;
          await CreditLedger.create(
            [
              {
                userId: operation.userId,
                eventKey: `${reservation.reservationKey}:${entry.kind}:${allocation.lotId}`,
                eventType: entry.kind === 'capture' ? 'capture_ai' : 'release_ai',
                lotId: allocation.lotId,
                reservationId: reservation._id,
                operationId: operation._id,
                deltaAvailable: entry.kind === 'release' ? entry.amount : 0,
                deltaReserved: -entry.amount,
                deltaConsumed: entry.kind === 'capture' ? entry.amount : 0,
                deltaRevoked: 0,
                creditsGrantedDelta: 0,
                reasonCode: outcome === 'capture' ? 'operation_completed' : failureCode,
                actorType: 'system',
                policyVersion: POLICY_VERSION,
              },
            ],
            { session },
          );
        }
      }
      reservation.status = reservationStatus;
      reservation.capturedCredits = capturedCredits;
      reservation.releasedCredits = releasedCredits;
      reservation.set('finalizedAt', new Date());
      await reservation.save({ session });
      operation.status = terminalStatus;
      operation.set('completedAt', new Date());
      if (outcome !== 'capture') operation.failureCode = failureCode.slice(0, 80);
      operation.stateVersion += 1;
      await operation.save({ session });
      await IdempotencyRecord.updateOne(
        { userId: operation.userId, scope: 'ai_operation', key: operation.clientIntentKey },
        { $set: { outcome: outcome === 'release' ? 'conflict' : 'completed' } },
        { session },
      );
      return { operationId: operation.id, status: operation.status, settled: true };
    };
    return externalSession ? work(externalSession) : inTransaction(work);
  },
};

export { MAX_GOODWILL_CREDITS, POLICY_VERSION, TRIAL_CREDITS, TRIAL_SKU };
