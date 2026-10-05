/**
 * Creating a bet, decided and written on the server (docs/SECURITY_PLAN.md step 3).
 *
 * The app used to create the Bet, then the creator's Participant, then debit the stake,
 * as three writes from the phone, deleting what it had made when a later one failed.
 * Skipping the debit made a bet whose creator never paid, a failure in the rollback left
 * one behind, and the balance was checked on the phone. Here the bet, the creator's
 * participant row and the stake are one ledger transaction: all of them or none.
 *
 * Pure, so it is unit tested; the money function reads the creator's name and applies
 * the plan.
 */

import type { LedgerEntry, StateUpdate } from './ledgerLogic';
import { participantIdFor, stakeTransactionId } from './joinLogic';

export const BET_CATEGORIES = ['SPORTS', 'ENTERTAINMENT', 'WEATHER', 'STOCKS', 'CUSTOM'] as const;

/** The form's own limits (CreateBetScreen), enforced here too. */
export const LIMITS = {
  title: 100,
  description: 500,
  sideName: 100,
  /** A deadline at most a year out. */
  deadlineMinutes: 365 * 24 * 60,
} as const;

export interface CreateBetArgs {
  /** Chosen by the app, so a retried tap cannot create a second bet. */
  betId: string;
  title: string;
  description: string;
  category: string;
  amount: number;
  side: string;
  sideAName: string;
  sideBName: string;
  deadlineMinutes: number;
  isPrivate?: boolean | null;
  eventId?: string | null;
}

export type CreateBetResult =
  | { status: 'created'; betId: string; balance: number }
  | { status: 'refused'; reason: 'INVALID'; field: string }
  | { status: 'refused'; reason: 'INSUFFICIENT_FUNDS'; balance: number; required: number }
  | { status: 'refused'; reason: 'BUSY' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
};

/** The first field that is not acceptable, or null. */
export function invalidField(args: CreateBetArgs): string | null {
  if (typeof args.betId !== 'string' || !UUID.test(args.betId)) return 'betId';
  if (!text(args.title, LIMITS.title)) return 'title';
  if (!text(args.description, LIMITS.description)) return 'description';
  if (!(BET_CATEGORIES as readonly string[]).includes(args.category)) return 'category';
  if (
    typeof args.amount !== 'number' ||
    !Number.isFinite(args.amount) ||
    args.amount <= 0 ||
    Math.abs(args.amount * 100 - Math.round(args.amount * 100)) > 1e-6
  ) {
    return 'amount';
  }
  if (args.side !== 'A' && args.side !== 'B') return 'side';
  if (!text(args.sideAName, LIMITS.sideName)) return 'sideAName';
  if (!text(args.sideBName, LIMITS.sideName)) return 'sideBName';
  if (
    !Number.isInteger(args.deadlineMinutes) ||
    args.deadlineMinutes < 1 ||
    args.deadlineMinutes > LIMITS.deadlineMinutes
  ) {
    return 'deadlineMinutes';
  }
  if (args.isPrivate !== undefined && args.isPrivate !== null && typeof args.isPrivate !== 'boolean') return 'isPrivate';
  if (args.eventId !== undefined && args.eventId !== null && typeof args.eventId !== 'string') return 'eventId';
  return null;
}

/**
 * The single write: the bet (created only if its id is free), the creator's participant
 * row and the stake debit. Assumes invalidField returned null.
 */
export function planCreateBet(params: {
  args: CreateBetArgs;
  userId: string;
  creatorName: string;
  now: string;
}): { participantId: string; entries: LedgerEntry[]; stateUpdates: StateUpdate[] } {
  const { args, userId, creatorName, now } = params;
  const amount = Math.round(args.amount * 100) / 100;
  const side = args.side as 'A' | 'B';
  const title = args.title.trim();
  const sideAName = args.sideAName.trim();
  const sideBName = args.sideBName.trim();
  const participantId = participantIdFor(args.betId, userId);

  const bet: Record<string, unknown> = {
    title,
    description: args.description.trim(),
    category: args.category,
    status: 'ACTIVE',
    creatorId: userId,
    creatorName,
    totalPot: amount,
    betAmount: amount,
    // An object, not JSON text: AppSync stores AWSJSON as a map, and text read back
    // through it arrives encoded twice
    odds: { sideAName, sideBName },
    deadline: new Date(new Date(now).getTime() + args.deadlineMinutes * 60_000).toISOString(),
    isPrivate: args.isPrivate === true,
    isTestBet: false,
    sideACount: side === 'A' ? 1 : 0,
    sideBCount: side === 'B' ? 1 : 0,
    participantUserIds: [userId],
  };
  if (args.eventId) bet.eventId = args.eventId;

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
        relatedBetId: args.betId,
        relatedParticipantId: participantId,
        notes: `${title} - You bet on ${side === 'A' ? sideAName : sideBName}`,
      },
    ],
    stateUpdates: [
      { table: 'Bet', id: args.betId, create: { typename: 'Bet' }, set: bet },
      {
        table: 'Participant',
        id: participantId,
        create: { typename: 'Participant' },
        set: {
          betId: args.betId,
          userId,
          side,
          amount,
          status: 'ACCEPTED',
          payout: 0,
          hasAcceptedResult: false,
          joinedAt: now,
        },
      },
    ],
  };
}
