/**
 * Joining a bet, decided and written on the server (docs/SECURITY_PLAN.md step 3).
 *
 * The app used to do it in three separate writes from the phone: create the Participant,
 * debit the stake, update the bet's counts. Skipping the debit joined for free, a failure
 * between them left a participant who never paid, nothing stopped a join after the
 * deadline, and two joins at once lost a count. Here the checks run on the server and the
 * participant row, the stake and the bet's counts are one ledger transaction, guarded on
 * the bet still being open.
 *
 * Pure, so it is unit tested; the money function reads the rows and applies the plan.
 */

import type { LedgerEntry, StateUpdate } from './ledgerLogic';

export type JoinRefusal =
  | 'NOT_FOUND'
  | 'NOT_OPEN'
  | 'EXPIRED'
  | 'INVALID_SIDE'
  | 'NO_STAKE'
  | 'AMOUNT_CHANGED'
  | 'ALREADY_JOINED'
  | 'NOT_INVITED'
  | 'INSUFFICIENT_FUNDS'
  | 'BUSY';

export type JoinResult =
  | { status: 'joined'; participantId: string; amount: number; balance: number }
  | { status: 'refused'; reason: JoinRefusal; balance?: number; required?: number; amount?: number };

export interface JoinBetRow {
  id: string;
  status?: string | null;
  deadline?: string | null;
  betAmount?: number | null;
  isPrivate?: boolean | null;
  title?: string | null;
}

export interface JoinRequest {
  bet: JoinBetRow | null | undefined;
  userId: string;
  side: string;
  /** The stake the app showed the user; refused if the bet's stake differs. */
  amount: number;
  now: string;
  /** The caller already has a participant row on this bet. */
  alreadyJoined: boolean;
  /** The caller holds a pending or accepted invitation to this bet. */
  invited: boolean;
}

/** One participant row per user per bet: the id makes a second join impossible. */
export const participantIdFor = (betId: string, userId: string) => `${betId}#${userId}`;
export const stakeTransactionId = (participantId: string) => `stake#${participantId}`;

/** Why this join cannot happen, or null when it can. Checked in this order. */
export function checkJoin(request: JoinRequest): JoinRefusal | null {
  const { bet, side, amount, now, alreadyJoined, invited } = request;
  if (!bet) return 'NOT_FOUND';
  if (bet.status !== 'ACTIVE') return 'NOT_OPEN';
  if (!bet.deadline || bet.deadline <= now) return 'EXPIRED';
  if (side !== 'A' && side !== 'B') return 'INVALID_SIDE';
  if (!bet.betAmount || !(bet.betAmount > 0)) return 'NO_STAKE';
  if (Math.round(bet.betAmount * 100) !== Math.round(amount * 100)) return 'AMOUNT_CHANGED';
  if (alreadyJoined) return 'ALREADY_JOINED';
  if (bet.isPrivate && !invited) return 'NOT_INVITED';
  return null;
}

/**
 * The single write for a join: the participant row (created only if its id is free), the
 * stake debit, and the bet's counts, pot and participant list, all guarded on the bet
 * still being ACTIVE with its deadline ahead. Assumes checkJoin passed.
 */
export function planJoin(params: {
  bet: JoinBetRow & { betAmount: number };
  userId: string;
  side: 'A' | 'B';
  sideName: string;
  now: string;
}): { participantId: string; entries: LedgerEntry[]; stateUpdates: StateUpdate[] } {
  const { bet, userId, side, sideName, now } = params;
  const participantId = participantIdFor(bet.id, userId);
  const amount = bet.betAmount;

  return {
    participantId,
    entries: [
      {
        transactionId: stakeTransactionId(participantId),
        userId,
        type: 'BET_PLACED',
        delta: -amount,
        amount,
        status: 'COMPLETED',
        mode: 'create',
        relatedBetId: bet.id,
        relatedParticipantId: participantId,
        notes: `${bet.title ?? 'Bet'} - You bet on ${sideName}`,
      },
    ],
    stateUpdates: [
      {
        table: 'Participant',
        id: participantId,
        create: { typename: 'Participant' },
        set: {
          betId: bet.id,
          userId,
          side,
          amount,
          status: 'ACCEPTED',
          payout: 0,
          hasAcceptedResult: false,
          // participantsByBet sorts on joinedAt: without it the row is not in the index
          joinedAt: now,
        },
      },
      {
        table: 'Bet',
        id: bet.id,
        set: {},
        add: { totalPot: amount, [side === 'A' ? 'sideACount' : 'sideBCount']: 1 },
        append: { participantUserIds: [userId] },
        expect: { status: 'ACTIVE' },
        expectAfter: { deadline: now },
      },
    ],
  };
}
