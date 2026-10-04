/**
 * Cancelling an expired bet and returning its stakes, kept apart from the handler so the
 * order of operations is tested (the handler cannot be imported by a test).
 *
 * The refunds and the bet's ACTIVE -> CANCELLED change are one ledger transaction: either
 * every stake is returned and the bet is cancelled, or nothing happens and the next run
 * tries again. Refunding first and cancelling afterwards left the bet ACTIVE, and
 * joinable, after its stakes had gone back; a join in that gap sent it to resolution
 * with the refunded stakes still counted in the pot, paying out money that was no longer
 * there.
 */

import type { LedgerEntry, LedgerResult, StateUpdate } from '../../shared/ledgerLogic';
import { refundTransactionId } from '../../shared/settlementLogic';
import type { Refund } from './expiryLogic';

/**
 * Refunds that fit in one transaction with the bet: each is a balance update and a ledger
 * row, and DynamoDB allows 100 items per transaction.
 */
export const REFUNDS_PER_TRANSACTION = 49;

export type ApplyLedger = (entries: LedgerEntry[], stateUpdates?: StateUpdate[]) => Promise<LedgerResult>;

export type CancelOutcome =
  | { status: 'cancelled' }
  /** The bet was no longer ACTIVE (cancelled by an earlier run, or changed by someone else). */
  | { status: 'skipped'; reason: string };

export function refundEntry(betId: string, refund: Refund, reason: string): LedgerEntry {
  return {
    transactionId: refundTransactionId(refund.participantId),
    userId: refund.userId,
    type: 'BET_CANCELLED',
    delta: refund.amount,
    amount: refund.amount,
    status: 'COMPLETED',
    mode: 'create',
    relatedBetId: betId,
    relatedParticipantId: refund.participantId,
    notes: `Refund: ${reason}`,
  };
}

/**
 * Cancel the bet and refund every stake. Throws when money could not be moved, so the
 * caller counts an error; a throw before the bet is cancelled leaves it for the next run.
 */
export async function cancelExpiredBet(
  apply: ApplyLedger,
  betId: string,
  refunds: Refund[],
  reason: string
): Promise<CancelOutcome> {
  const cancel: StateUpdate = {
    table: 'Bet',
    id: betId,
    set: { status: 'CANCELLED', resolutionReason: reason },
    expect: { status: 'ACTIVE' },
  };
  const entries = refunds.map((refund) => refundEntry(betId, refund, reason));

  if (entries.length <= REFUNDS_PER_TRANSACTION) {
    const result = await apply(entries, [cancel]);
    if (result.status === 'applied') return { status: 'cancelled' };
    if (result.status === 'state_changed') return { status: 'skipped', reason: 'bet no longer ACTIVE' };
    if (result.status === 'already_applied') {
      // The refund rows exist, which only a committed cancellation writes: the index
      // listed the bet as ACTIVE before catching up. Cancelling alone confirms that
      // without moving money.
      const confirm = await apply([], [cancel]);
      if (confirm.status === 'applied') return { status: 'cancelled' };
      if (confirm.status === 'state_changed') return { status: 'skipped', reason: 'already cancelled' };
      throw new Error(`Bet ${betId}: refunds exist but the bet could not be cancelled: ${JSON.stringify(confirm)}`);
    }
    throw new Error(`Bet ${betId}: refunds and cancellation refused: ${JSON.stringify(result)}`);
  }

  // Too many stakes for one transaction. Cancel first, so nobody can join while the
  // refunds go through, then refund in batches. Each batch is atomic and idempotent on
  // its ids; a batch that fails is logged by the throw below and needs a manual re-run,
  // because the bet is no longer ACTIVE for the next run to pick up.
  const cancelled = await apply([], [cancel]);
  if (cancelled.status === 'state_changed') return { status: 'skipped', reason: 'bet no longer ACTIVE' };
  if (cancelled.status !== 'applied') {
    throw new Error(`Bet ${betId}: could not cancel: ${JSON.stringify(cancelled)}`);
  }
  const failures: string[] = [];
  for (let i = 0; i < entries.length; i += REFUNDS_PER_TRANSACTION) {
    const batch = entries.slice(i, i + REFUNDS_PER_TRANSACTION);
    try {
      const result = await apply(batch);
      if (result.status !== 'applied' && result.status !== 'already_applied') {
        failures.push(`${batch.map((e) => e.transactionId).join(',')}: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      failures.push(`${batch.map((e) => e.transactionId).join(',')}: ${String(error)}`);
    }
  }
  if (failures.length) {
    throw new Error(`Bet ${betId} cancelled but refunds failed (re-run them by hand): ${failures.join(' | ')}`);
  }
  return { status: 'cancelled' };
}
