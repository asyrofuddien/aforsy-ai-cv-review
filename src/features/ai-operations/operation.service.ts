/**
 * Operation Service — AI operation lifecycle management.
 *
 * This module is the single point of truth for creating, leasing, and settling
 * AI operations (cv_review_bundle and ai_draft). It coordinates with the billing
 * service (reserve/capture/release) and writes OutboxEvents for downstream work.
 *
 * IMPORTANT: None of these methods are exposed as HTTP endpoints. They are called
 * exclusively from:
 *   - evaluation.controller and cv-draft-ai.controller  → createAndReserve
 *   - evaluation.worker and ai-draft.worker             → all remaining methods
 *
 * References:
 *   - REQ-M4-001 (reserve + outbox in one transaction)
 *   - REQ-M4-002 (worker lease and fencing)
 *   - REQ-M4-003 (capture on success)
 *   - REQ-M4-004 (release on terminal failure)
 *   - REQ-M4-005 (AiOperationResult persistence)
 */

import mongoose from 'mongoose';
import { AppError } from '../../middlewares/error.middleware';
import {
  AiOperation,
  AiOperationResult,
  CreditReservation,
  IAiOperation,
  OutboxEvent,
} from '../../models/billing.models';
import { billingService } from '../billing/billing.service';
import Evaluation from '../../models/evaluation.model';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/**
 * Input to createAndReserve — covers both cv_review_bundle and ai_draft.
 * The caller (controller) is responsible for validating the source document
 * and computing the input fingerprint before calling this method.
 */
export interface CreateOperationInput {
  /** Authenticated user's string ID (from req.authUser.userId). */
  userId: string;

  /** Which AI action to run. Drives cost lookup in ActionCost collection. */
  action: 'cv_review_bundle' | 'ai_draft';

  /**
   * Content locale ('id' | 'en'). Passed through to AiOperation and
   * determines email template locale for result notifications.
   */
  locale: 'id' | 'en';

  /**
   * SHA-256 hex digest of the normalised input content (CV text + JD text).
   * Used for idempotency conflict detection: same key + different fingerprint
   * → 409 IDEMPOTENCY_CONFLICT.
   */
  inputFingerprint: string;

  /**
   * Opaque reference to where the input snapshot is stored (e.g. a Document
   * ObjectId or an S3 key). Persisted on AiOperation for audit; never
   * returned to the client.
   */
  inputSnapshotRef: string;

  /**
   * Client-generated idempotency key (from Idempotency-Key header).
   * Must match /^[A-Za-z0-9._:-]{8,180}$/.
   */
  idempotencyKey: string;

  /**
   * Maximum number of worker lease attempts before the operation is
   * permanently failed. Defaults to 3 when omitted. Must be 1–5.
   */
  maxAttempts?: number;
  /** Private durable source needed to recover work after Redis loss. */
  inputSnapshot?: Record<string, unknown>;
}

/**
 * Returned by createAndReserve. Controllers use this to build the 202 response
 * body (REQ-M4-001 AC7).
 */
export interface OperationCreatedResult {
  /** Newly created (or previously created for idempotent replay) operation. */
  operation: IAiOperation & { id: string };

  /**
   * Whether this is an idempotent replay (true) or a fresh creation (false).
   * Controllers can use this to decide whether to log a "new job created" metric.
   */
  reused: boolean;

  /** Snapshot of the credit reservation for the 202 billing summary. */
  billing: {
    /** Always 'held' — credits are held until the worker captures or releases. */
    status: 'held';
    /** Number of credits reserved for this operation. */
    credits: number;
  };

  /** Wallet projection at the moment of reservation — used in the 202 body. */
  wallet: {
    availableCredits: number;
    reservedCredits: number;
  };
}

// ---------------------------------------------------------------------------
// Error sentinel used for skeleton methods not yet implemented
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface OperationService {
  /**
   * Create an AiOperation, reserve credits, and enqueue an OutboxEvent — all
   * within a single MongoDB transaction (REQ-M4-001 AC1).
   *
   * Idempotent: calling with the same (userId, idempotencyKey, fingerprint)
   * returns the existing operation and reservation without side-effects
   * (REQ-M4-001 AC5). Different fingerprint with the same key throws 409
   * (REQ-M4-001 AC6).
   *
   * On success: responds with the operation id and billing summary so the
   * HTTP handler can return 202 { operationId, billing, wallet } (REQ-M4-001 AC7).
   *
   * Called from: evaluation.controller, cv-draft-ai.controller.
   */
  createAndReserve(input: CreateOperationInput): Promise<OperationCreatedResult>;

  /**
   * Attempt to claim the lease on a queued AiOperation before the worker
   * starts processing (REQ-M4-002 AC1).
   *
   * Uses a conditional MongoDB update (status='queued' AND leaseUntil < now)
   * to ensure only one worker can claim the operation at a time (fencing).
   * Increments attemptCount; throws if attemptCount >= maxAttempts.
   *
   * Returns the updated AiOperation with the workerToken set.
   * Throws 409 if the operation is already claimed or in a terminal state.
   *
   * Called from: evaluation.worker, ai-draft.worker.
   */
  claimLease(operationId: string, workerToken: string): Promise<IAiOperation & { id: string }>;

  /**
   * Extend the worker lease on a running AiOperation (REQ-M4-002 AC2).
   *
   * Workers must call this every ~30 s to prevent the reconciler from
   * reclaiming the operation. The update is conditional on the workerToken
   * matching, so stale/crashed workers cannot extend a lease that has been
   * taken over (REQ-M4-002 AC4).
   *
   * Throws if the workerToken does not match (operation reclaimed) or if the
   * operation is no longer in 'running' state.
   *
   * Called from: evaluation.worker, ai-draft.worker.
   */
  heartbeat(operationId: string, workerToken: string): Promise<void>;
  retryLease(operationId: string, workerToken: string): Promise<void>;

  /**
   * Persist the result, capture credits, and emit an outbox email event —
   * all within a single MongoDB transaction (REQ-M4-003 AC1–AC2, REQ-M4-005 AC1).
   *
   * Steps (transactional):
   *   1. Save AiOperationResult { state: 'available', expiresAt: createdAt+30d }
   *   2. billingService.settleCreditOperation(operationId, 'capture')
   *   3. Update AiOperation.status → 'completed'
   *   4. Create OutboxEvent { type: 'email.result_ready', entityId: operationId }
   *
   * No-match valid (search ran but found no jobs) is treated as a success and
   * triggers capture — it is NOT a failure (REQ-M4-003 AC3).
   *
   * Idempotent: if the operation is already 'completed' with a captured
   * reservation, returns without side-effects (REQ-M4-003 AC6).
   *
   * Called from: evaluation.worker, ai-draft.worker (after all stages succeed).
   */
  saveResultAndCapture(operationId: string, resultData: unknown, workerToken?: string): Promise<void>;

  /**
   * Persist a partial review result, release all reserved credits, and emit
   * an outbox notification — within a single MongoDB transaction (REQ-M4-004 AC2).
   *
   * Use case: CV review succeeded but job matching failed terminally after all
   * retries. The operation is marked 'completed_partial'; the user gets the
   * review result but no matching output. Credits are fully released (3 credits
   * back to available) because matching was a technical failure (REQ-M4-004 AC6).
   *
   * Idempotent: if already 'completed_partial', returns without side-effects
   * (REQ-M4-004 AC5).
   *
   * @param operationId  - AiOperation ObjectId string.
   * @param failureCode  - Reason for the partial failure (e.g. 'matching_failed_final').
   * @param partialResult - Optional review stage output saved to AiOperationResult.
   *
   * Called from: evaluation.worker (matching stage terminal failure).
   */
  savePartialAndRelease(
    operationId: string,
    failureCode: string,
    partialResult?: unknown,
    workerToken?: string,
  ): Promise<void>;

  /**
   * Release all reserved credits and mark the operation as terminally failed
   * within a single MongoDB transaction (REQ-M4-004 AC1).
   *
   * Use case: all worker retry attempts for the review stage are exhausted and
   * no valid result was produced. Credits are released in full.
   *
   * Idempotent: if already 'failed' with a released reservation, returns without
   * side-effects (REQ-M4-004 AC5).
   *
   * @param operationId - AiOperation ObjectId string.
   * @param failureCode - Reason for terminal failure (e.g. 'review_failed_final').
   *
   * Called from: evaluation.worker, ai-draft.worker (all-retries-exhausted path).
   */
  releaseTerminal(operationId: string, failureCode: string, workerToken?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation (skeletons — full logic added in tasks 4.2, 5.1, 6.1)
// ---------------------------------------------------------------------------

async function inTransaction<T>(
  work: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 20
    ) {
      throw new AppError(
        'MongoDB transactions are unavailable; billing is temporarily disabled.',
        503,
      );
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid operation ID.', 400);
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Concrete implementation of OperationService.
 *
 * Task 1.1: interface + skeleton only. Full method bodies are added in:
 *   - createAndReserve: this task (delegates to billingService.createCreditOperation)
 *   - claimLease:       task 4.2
 *   - heartbeat:        task 4.2
 *   - saveResultAndCapture: task 5.1
 *   - savePartialAndRelease: task 6.1
 *   - releaseTerminal:  task 6.1
 */
class OperationServiceImpl implements OperationService {
  /**
   * Creates an AiOperation + CreditReservation + OutboxEvent in one transaction.
   * Delegates credit reservation to billingService.createCreditOperation (M3 primitive).
   *
   * REQ-M4-001 AC1: reserve, AiOperation(queued), OutboxEvent in one DB transaction.
   * REQ-M4-001 AC5–6: idempotency enforced by billingService.createCreditOperation.
   * REQ-M4-001 AC7: returns billing summary for the 202 response.
   */
  async createAndReserve(input: CreateOperationInput): Promise<OperationCreatedResult> {
    const { operation, reservation, reused } = await inTransaction(async session => {
      const created = await billingService.createCreditOperation({
        userId: input.userId, action: input.action, locale: input.locale,
        inputFingerprint: input.inputFingerprint, inputSnapshotRef: input.inputSnapshotRef,
        idempotencyKey: input.idempotencyKey, maxAttempts: input.maxAttempts, session,
      });
      if (!created.reused) {
        const snapshot = input.inputSnapshot ?? {};
        const update: Record<string, unknown> = { inputSnapshot: snapshot };
        if (input.action === 'cv_review_bundle') {
          const cvDocumentId = String(snapshot.cvDocumentId || '');
          if (!mongoose.isValidObjectId(cvDocumentId)) throw new AppError('A valid CV source is required.', 400);
          const evaluation = await Evaluation.create([{
            cvDocumentId: new mongoose.Types.ObjectId(cvDocumentId), userId: new mongoose.Types.ObjectId(input.userId),
            candidateName: snapshot.candidateName, jobDescriptionId: snapshot.jobDescriptionId ? new mongoose.Types.ObjectId(String(snapshot.jobDescriptionId)) : undefined,
            locale: input.locale, evaluationMode: snapshot.jobDescriptionId || snapshot.jobDescriptionText ? 'job_specific' : 'general', status: 'queued',
          }], { session }).then(([createdEvaluation]) => createdEvaluation);
          update.resourceId = evaluation._id;
        }
        await AiOperation.updateOne({ _id: created.operation._id }, { $set: update }, { session });
        await OutboxEvent.create([{
          eventKey: `ai-operation.enqueue:${created.operation.id}`,
          type: 'ai-operation.enqueue', entityId: created.operation._id,
          payload: { operationId: created.operation.id }, state: 'pending', attempts: 0,
          nextAttemptAt: new Date(),
        }], { session });
      }
      return created;
    });
    const wallet = (await billingService.getWallet(input.userId)).wallet;
    return {
      operation: operation as IAiOperation & { id: string }, reused,
      billing: { status: 'held', credits: reservation.totalCredits },
      wallet: { availableCredits: wallet.availableCredits, reservedCredits: wallet.reservedCredits },
    };
  }

  /**
   * Claim a lease on a queued AiOperation using a conditional MongoDB update.
   * Only one worker can succeed; all others receive a 409 (fencing).
   *
   * Full implementation: task 4.2.
   * REQ-M4-002 AC1, AC3, AC6.
   */
  async claimLease(operationId: string, workerToken: string): Promise<IAiOperation & { id: string }> {
    if (!workerToken || workerToken.length > 180) throw new AppError('Invalid worker token.', 400);
    const now = new Date();
    const id = toObjectId(operationId);
    const op = await AiOperation.findOneAndUpdate({
      _id: id, status: { $in: ['queued', 'running'] }, $expr: { $lt: ['$attemptCount', '$maxAttempts'] },
      $or: [{ leaseUntil: null }, { leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }],
    }, {
      $set: { status: 'running', workerToken, leaseUntil: new Date(now.getTime() + 90_000) },
      $inc: { attemptCount: 1, stateVersion: 1 },
    }, { new: true });
    if (!op) {
      const current = await AiOperation.findById(id).select('status attemptCount maxAttempts').lean();
      if (current?.status === 'queued' && current.attemptCount >= current.maxAttempts) {
        await this.releaseTerminal(operationId, 'attempts_exhausted');
      }
      throw new AppError('Operation is already claimed or unavailable.', 409);
    }
    return op as IAiOperation & { id: string };
  }

  async heartbeat(operationId: string, workerToken: string): Promise<void> {
    const result = await AiOperation.updateOne(
      { _id: toObjectId(operationId), status: 'running', workerToken },
      { $set: { leaseUntil: new Date(Date.now() + 90_000) }, $inc: { stateVersion: 1 } },
    );
    if (result.modifiedCount !== 1) throw new AppError('Operation lease was lost.', 409);
  }

  async retryLease(operationId: string, workerToken: string): Promise<void> {
    const result = await AiOperation.updateOne({ _id: toObjectId(operationId), status: 'running', workerToken }, {
      $set: { status: 'queued' }, $unset: { workerToken: 1, leaseUntil: 1 }, $inc: { stateVersion: 1 },
    });
    if (result.modifiedCount !== 1) throw new AppError('Operation lease was lost.', 409);
  }

  async saveResultAndCapture(operationId: string, resultData: unknown, workerToken?: string): Promise<void> {
    const id = toObjectId(operationId);
    await inTransaction(async session => {
      const op = await AiOperation.findById(id).session(session);
      if (!op) throw new AppError('AI operation not found.', 404);
      if (op.status === 'completed') return;
      if (op.status !== 'running' || (workerToken && op.workerToken !== workerToken)) throw new AppError('Operation lease was lost.', 409);
      const now = new Date();
      const result = await AiOperationResult.findOneAndUpdate({ operationId: id }, {
        $setOnInsert: {
          operationId: id, userId: op.userId, resultData, schemaVersion: 1,
          source: op.action === 'ai_draft' ? 'ai_draft' : 'review', state: 'available',
          expiresAt: new Date(now.getTime() + 30 * 86400_000),
        },
      }, { upsert: true, new: true, session });
      await billingService.settleCreditOperation(operationId, 'capture', 'operation_completed', session);
      op.status = 'completed'; op.resultId = result._id; op.completedAt = now;
      op.set('inputSnapshot', undefined); op.workerToken = undefined; op.leaseUntil = undefined; op.stateVersion += 1;
      await op.save({ session });
      await OutboxEvent.updateOne({ eventKey: `ai-operation.result-ready:${op.id}` }, { $setOnInsert: {
        eventKey: `ai-operation.result-ready:${op.id}`, type: 'email.result_ready', entityId: op._id,
        payload: { operationId: op.id, userId: op.userId.toString(), locale: op.locale }, state: 'pending', attempts: 0, nextAttemptAt: now,
      } }, { upsert: true, session });
    });
  }

  async savePartialAndRelease(operationId: string, failureCode: string, partialResult?: unknown, workerToken?: string): Promise<void> {
    const id = toObjectId(operationId);
    await inTransaction(async session => {
      const op = await AiOperation.findById(id).session(session);
      if (!op) throw new AppError('AI operation not found.', 404);
      if (op.status === 'completed_partial') return;
      if (op.status !== 'running' || (workerToken && op.workerToken !== workerToken)) throw new AppError('Operation lease was lost.', 409);
      const now = new Date();
      let resultId = op.resultId;
      if (partialResult !== undefined) {
        const result = await AiOperationResult.findOneAndUpdate({ operationId: id }, { $setOnInsert: {
          operationId: id, userId: op.userId, resultData: partialResult, schemaVersion: 1,
          source: 'review', state: 'available', expiresAt: new Date(now.getTime() + 30 * 86400_000),
        } }, { upsert: true, new: true, session });
        resultId = result._id;
      }
      await billingService.settleCreditOperation(operationId, 'release', failureCode, session);
      op.status = 'completed_partial'; op.failureCode = failureCode.slice(0,80); op.completedAt = now;
      if (resultId) op.resultId = resultId;
      op.set('inputSnapshot', undefined); op.workerToken = undefined; op.leaseUntil = undefined; op.stateVersion += 1;
      await op.save({ session });
      await OutboxEvent.updateOne({ eventKey: `ai-operation.partial:${op.id}` }, { $setOnInsert: {
        eventKey: `ai-operation.partial:${op.id}`, type: 'email.partial_result', entityId: op._id,
        payload: { operationId: op.id, userId: op.userId.toString(), locale: op.locale }, state: 'pending', attempts: 0, nextAttemptAt: now,
      } }, { upsert: true, session });
    });
  }

  async releaseTerminal(operationId: string, failureCode: string, workerToken?: string): Promise<void> {
    const id = toObjectId(operationId);
    await inTransaction(async session => {
      const op = await AiOperation.findById(id).session(session);
      if (!op) throw new AppError('AI operation not found.', 404);
      if (op.status === 'failed') return;
      if (op.status !== 'queued' && op.status !== 'running') throw new AppError('Operation is already terminal.', 409);
      if (workerToken && op.workerToken !== workerToken) throw new AppError('Operation lease was lost.', 409);
      const now = new Date();
      await billingService.settleCreditOperation(operationId, 'release', failureCode, session);
      op.status = 'failed'; op.failureCode = failureCode.slice(0,80); op.completedAt = now;
      op.set('inputSnapshot', undefined); op.workerToken = undefined; op.leaseUntil = undefined; op.stateVersion += 1;
      await op.save({ session });
      await OutboxEvent.updateOne({ eventKey: `ai-operation.failed:${op.id}` }, { $setOnInsert: {
        eventKey: `ai-operation.failed:${op.id}`, type: 'email.operation_failed', entityId: op._id,
        payload: { operationId: op.id, userId: op.userId.toString(), locale: op.locale, failureCode: op.failureCode }, state: 'pending', attempts: 0, nextAttemptAt: now,
      } }, { upsert: true, session });
    });
  }

}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const operationService: OperationService = new OperationServiceImpl();
