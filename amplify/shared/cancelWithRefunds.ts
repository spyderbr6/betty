/**
 * Cancelling something that holds stakes (an expired bet, a squares game) and returning
 * them, through the ledger. Pure apart from the ledger call it is given, so the order of
 * operations is unit tested; the scheduled Lambdas cannot be imported by a test.
 *
 * The refunds and the ACTIVE -> CANCELLED change (or whatever state the caller read) are
 * one ledger transaction: either every stake is returned and the item is cancelled, or
 * nothing happens and the next run tries again. Refunding first and cancelling afterwards
 * left the item open, and joinable, after its stakes had gone back; for a bet, a join in
 * that gap sent it to resolution with the refunded stakes still counted in the pot.
 */

import type { LedgerEntry, LedgerResult, StateUpdate } from './ledgerLogic';

/**
 * Refunds that fit in one transaction with the cancellation: each is a balance update and
 * a ledger row, and DynamoDB allows 100 items per transaction.
 */
export const REFUNDS_PER_TRANSACTION = 49;

export type ApplyLedger = (entries: LedgerEntry[], stateUpdates?: StateUpdate[]) => Promise<LedgerResult>;

export type CancelOutcome =
  | { status: 'cancelled' }
  /** The item had already moved on (cancelled by an earlier run, or changed by someone else). */
  | { status: 'skipped'; reason: string };

/**
 * Apply `cancel` (a guarded state change) and every refund. Throws when money could not
 * be moved, so the caller counts an error; a throw before the cancellation leaves the item
 * for the next run.
 */
export async function cancelWithRefunds(
  apply: ApplyLedger,
  cancel: StateUpdate,
  entries: LedgerEntry[]
): Promise<CancelOutcome> {
  const label = `${cancel.table} ${cancel.id}`;

  if (entries.length <= REFUNDS_PER_TRANSACTION) {
    const result = await apply(entries, [cancel]);
    if (result.status === 'applied') return { status: 'cancelled' };
    if (result.status === 'state_changed') return { status: 'skipped', reason: 'no longer in the expected state' };
    if (result.status === 'already_applied') {
      // The refund rows exist, which only a committed cancellation writes: the index
      // listed the item in its old state before catching up. Cancelling alone confirms
      // that without moving money.
      const confirm = await apply([], [cancel]);
      if (confirm.status === 'applied') return { status: 'cancelled' };
      if (confirm.status === 'state_changed') return { status: 'skipped', reason: 'already cancelled' };
      throw new Error(`${label}: refunds exist but it could not be cancelled: ${JSON.stringify(confirm)}`);
    }
    throw new Error(`${label}: refunds and cancellation refused: ${JSON.stringify(result)}`);
  }

  // Too many stakes for one transaction. Cancel first, so nobody can join while the
  // refunds go through, then refund in batches. Each batch is atomic and idempotent on
  // its ids; a batch that fails is reported by the throw below and needs a manual re-run,
  // because the item is no longer in a state the next run picks up.
  const cancelled = await apply([], [cancel]);
  if (cancelled.status === 'state_changed') return { status: 'skipped', reason: 'no longer in the expected state' };
  if (cancelled.status !== 'applied') {
    throw new Error(`${label}: could not cancel: ${JSON.stringify(cancelled)}`);
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
    throw new Error(`${label} cancelled but refunds failed (re-run them by hand): ${failures.join(' | ')}`);
  }
  return { status: 'cancelled' };
}
