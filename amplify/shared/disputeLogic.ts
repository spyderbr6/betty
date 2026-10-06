/**
 * An admin resolving a dispute, decided and written on the server (docs/SECURITY_PLAN.md
 * step 3).
 *
 * The admin's phone used to do it, after checking a role field users could write. An
 * upheld dispute set the bet back to PENDING_RESOLUTION and left the original winners'
 * PENDING payouts in place. Here the caller must be in the admins group; upholding clears
 * the winner and cancels those payouts in one ledger transaction, guarded on the bet being
 * unchanged, and the creator resolves again. A bet already RESOLVED (paid) is refused:
 * sending it back would pay it a second time, so reversing a paid bet is a manual matter.
 *
 * Pure, so it is unit tested; the money function reads the rows and applies the plan.
 */

import type { StateUpdate } from './ledgerLogic';

export const DISPUTE_OUTCOMES = ['RESOLVED_FOR_FILER', 'RESOLVED_FOR_CREATOR', 'DISMISSED'] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

export type DisputeRefusal = 'NOT_ADMIN' | 'NOT_FOUND' | 'NOT_OPEN' | 'INVALID_OUTCOME' | 'ALREADY_PAID' | 'BUSY';

export type ResolveDisputeResult =
  | { status: 'resolved'; outcome: DisputeOutcome; payoutsCancelled: number }
  | { status: 'refused'; reason: DisputeRefusal };

export interface DisputeRow {
  id: string;
  betId?: string | null;
  status?: string | null;
  filedBy?: string | null;
  againstUserId?: string | null;
}

export interface DisputeBetRow {
  id: string;
  status?: string | null;
  updatedAt?: string | null;
}

/** Why this resolution cannot happen, or null when it can. */
export function checkResolveDispute(params: {
  dispute: DisputeRow | null | undefined;
  bet: DisputeBetRow | null | undefined;
  outcome: unknown;
}): DisputeRefusal | null {
  const { dispute, bet, outcome } = params;
  if (!dispute) return 'NOT_FOUND';
  if (dispute.status !== 'PENDING' && dispute.status !== 'UNDER_REVIEW') return 'NOT_OPEN';
  if (!(DISPUTE_OUTCOMES as readonly unknown[]).includes(outcome)) return 'INVALID_OUTCOME';
  if (outcome === 'RESOLVED_FOR_FILER') {
    if (!bet) return 'NOT_FOUND';
    if (bet.status === 'RESOLVED') return 'ALREADY_PAID';
  }
  return null;
}

/**
 * Dismissing (or finding for the creator): filing a dispute set the bet to DISPUTED, which
 * the payout processor skips, so the bet goes back to PENDING_RESOLUTION with its result
 * and the payout goes ahead. Nothing to write if it was never marked DISPUTED.
 */
export function planDismiss(bet: DisputeBetRow | null | undefined): StateUpdate[] {
  if (!bet || bet.status !== 'DISPUTED') return [];
  return [{ table: 'Bet', id: bet.id, set: { status: 'PENDING_RESOLUTION' }, expect: { status: 'DISPUTED' } }];
}

/**
 * Upholding: the bet back to PENDING_RESOLUTION with no winner, so the creator resolves
 * again and the payout processor will not pay, and every PENDING winnings row cancelled,
 * all guarded on the bet being unchanged since it was read.
 */
export function planUphold(params: {
  bet: DisputeBetRow;
  existing: Array<{ id: string; type?: string | null; status?: string | null }>;
}): StateUpdate[] {
  const { bet, existing } = params;
  return [
    {
      table: 'Bet',
      id: bet.id,
      set: { status: 'PENDING_RESOLUTION', winningSide: null },
      expect: { status: bet.status, updatedAt: bet.updatedAt ?? null },
    },
    ...existing
      .filter((row) => row.type === 'BET_WON' && row.status === 'PENDING')
      .map((row) => ({
        table: 'Transaction' as const,
        id: row.id,
        set: { status: 'CANCELLED', failureReason: 'Dispute upheld: the result was overturned' },
        expect: { status: 'PENDING' },
      })),
  ];
}
