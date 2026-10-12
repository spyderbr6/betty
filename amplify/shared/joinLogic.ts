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

import { countField, isBetOption, isHeadToHead, type BetOddsShape, type OptionKey } from './betOptions';
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
  | 'FULL'
  | 'SIDE_TAKEN'
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
  /** Names the bet's options (the `odds` JSON, parsed); a side outside them is refused. */
  odds?: BetOddsShape | null;
  /** 2 on a head-to-head bet: one opponent, on the side the creator did not take. */
  maxParticipants?: number | null;
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
  /** The side of every participant already on the bet. */
  takenSides: string[];
}

/** One participant row per user per bet: the id makes a second join impossible. */
export const participantIdFor = (betId: string, userId: string) => `${betId}#${userId}`;
export const stakeTransactionId = (participantId: string) => `stake#${participantId}`;

/** Why this join cannot happen, or null when it can. Checked in this order. */
export function checkJoin(request: JoinRequest): JoinRefusal | null {
  const { bet, side, amount, now, alreadyJoined, invited, takenSides } = request;
  if (!bet) return 'NOT_FOUND';
  if (bet.status !== 'ACTIVE') return 'NOT_OPEN';
  if (!bet.deadline || bet.deadline <= now) return 'EXPIRED';
  if (!isBetOption(bet.odds, side)) return 'INVALID_SIDE';
  if (!bet.betAmount || !(bet.betAmount > 0)) return 'NO_STAKE';
  if (Math.round(bet.betAmount * 100) !== Math.round(amount * 100)) return 'AMOUNT_CHANGED';
  if (alreadyJoined) return 'ALREADY_JOINED';
  if (bet.isPrivate && !invited) return 'NOT_INVITED';
  if (isHeadToHead(bet)) {
    if (takenSides.length >= 2) return 'FULL';
    if (takenSides.includes(side)) return 'SIDE_TAKEN';
  }
  return null;
}

/**
 * The single write for a join: the participant row (created only if its id is free), the
 * stake debit, and the bet's counts, pot and participant list, all guarded on the bet
 * still being ACTIVE with its deadline ahead. On a head-to-head bet it is also guarded on
 * nobody holding the side yet, so two opponents joining at once cannot both get in.
 * Assumes checkJoin passed.
 */
export function planJoin(params: {
  bet: JoinBetRow & { betAmount: number };
  userId: string;
  side: OptionKey;
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
        add: { totalPot: amount, [countField(side)]: 1 },
        append: { participantUserIds: [userId] },
        expect: isHeadToHead(bet) ? { status: 'ACTIVE', [countField(side)]: 0 } : { status: 'ACTIVE' },
        expectAfter: { deadline: now },
      },
    ],
  };
}
