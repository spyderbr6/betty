/**
 * The two bet status changes the app used to write itself (docs/SECURITY_PLAN.md step 5):
 * the creator ending a bet early, and a participant disputing the result. Step 5 takes
 * Bet updates away from the app, so they are decided here and written by the money
 * function. Pure, so it is unit tested.
 */

import type { StateUpdate } from './ledgerLogic';
import { hasOpenDispute } from './settlementLogic';

export interface StatusBetRow {
  id: string;
  status?: string | null;
  creatorId?: string | null;
  winningSide?: string | null;
  participantUserIds?: (string | null)[] | null;
  disputeWindowEndsAt?: string | null;
}

export type EndEarlyResult =
  | { status: 'ended' }
  | { status: 'refused'; reason: 'NOT_FOUND' | 'NOT_CREATOR' | 'NOT_ACTIVE' };

export type FileDisputeResult =
  | { status: 'filed'; disputeId: string }
  | { status: 'refused'; reason: FileDisputeRefusal };

export type FileDisputeRefusal =
  | 'NOT_FOUND'
  | 'NOT_PARTICIPANT'
  | 'IS_CREATOR'
  | 'NOT_RESOLVED'
  | 'WINDOW_CLOSED'
  | 'ALREADY_DISPUTED'
  | 'INVALID';

export const DISPUTE_REASONS = ['INCORRECT_RESOLUTION', 'NO_RESOLUTION', 'EVIDENCE_IGNORED', 'OTHER'] as const;
export const DISPUTE_DESCRIPTION_MAX = 2000;

/** Why the caller cannot end this bet now, or null. */
export function checkEndEarly(bet: StatusBetRow | null | undefined, userId: string): Exclude<EndEarlyResult, { status: 'ended' }>['reason'] | null {
  if (!bet) return 'NOT_FOUND';
  if (bet.creatorId !== userId) return 'NOT_CREATOR';
  if (bet.status !== 'ACTIVE') return 'NOT_ACTIVE';
  return null;
}

/** ACTIVE -> PENDING_RESOLUTION, only if the bet is still ACTIVE when written. */
export function planEndEarly(betId: string): StateUpdate[] {
  return [{ table: 'Bet', id: betId, set: { status: 'PENDING_RESOLUTION' }, expect: { status: 'ACTIVE' } }];
}

/**
 * Why the caller cannot dispute this bet now, or null. A dispute is against a result
 * that has not been paid yet: the bet awaits payout (PENDING_RESOLUTION with a winner)
 * and its dispute window is open. Paid bets cannot be overturned (adminResolveDispute
 * refuses them), so they cannot be disputed either.
 */
export function checkFileDispute(params: {
  bet: StatusBetRow | null | undefined;
  userId: string;
  reason: string;
  description: string;
  disputes: { status?: string | null }[];
  now: string;
}): FileDisputeRefusal | null {
  const { bet, userId, reason, description, disputes, now } = params;
  if (!(DISPUTE_REASONS as readonly string[]).includes(reason)) return 'INVALID';
  if (typeof description !== 'string' || !description.trim() || description.length > DISPUTE_DESCRIPTION_MAX) return 'INVALID';
  if (!bet) return 'NOT_FOUND';
  if (bet.creatorId === userId) return 'IS_CREATOR';
  if (!(bet.participantUserIds ?? []).includes(userId)) return 'NOT_PARTICIPANT';
  if (bet.status !== 'PENDING_RESOLUTION' || !bet.winningSide) return 'NOT_RESOLVED';
  if (bet.disputeWindowEndsAt && now >= bet.disputeWindowEndsAt) return 'WINDOW_CLOSED';
  if (hasOpenDispute(disputes)) return 'ALREADY_DISPUTED';
  return null;
}

/** The bet becomes DISPUTED, only if it is still awaiting payout with the same winner. */
export function planDisputeBet(bet: StatusBetRow): StateUpdate[] {
  return [
    {
      table: 'Bet',
      id: bet.id,
      set: { status: 'DISPUTED' },
      expect: { status: 'PENDING_RESOLUTION', winningSide: bet.winningSide ?? null },
    },
  ];
}
