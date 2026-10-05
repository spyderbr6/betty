/**
 * Resolving a bet (the creator picks the winner), decided and written on the server
 * (docs/SECURITY_PLAN.md step 3).
 *
 * The creator's phone used to do it: set the winner and the 48-hour dispute window, write
 * each participant's payout, create the PENDING winnings with amounts and fees it computed
 * itself, and record each loss through a call that rewrote the loser's balance with a
 * value read moments earlier. Here the server checks the caller is the creator and the bet
 * is resolvable, computes the payouts from the stakes (planSettlement, the same rule the
 * payout uses), and writes the result in one ledger transaction guarded on the bet being
 * unchanged since it was read. No balance moves at resolution: winnings are paid by the
 * payout processor after the window (settleBet), which recomputes them; the PENDING rows
 * written here are what the wallet shows as pending payouts until then.
 *
 * Pure, so it is unit tested; the money function reads the rows and applies the plan.
 */

import type { LedgerEntry, StateUpdate } from './ledgerLogic';
import {
  DISPUTE_WINDOW_MS,
  lossTransactionId,
  payoutTransactionId,
  planSettlement,
  type SettlementParticipant,
} from './settlementLogic';

export type ResolveRefusal = 'NOT_FOUND' | 'NOT_CREATOR' | 'NOT_RESOLVABLE' | 'INVALID_SIDE' | 'BUSY';

export type ResolveResult =
  | { status: 'resolved'; winningSide: 'A' | 'B'; disputeWindowEndsAt: string; winners: number; refundedNoWinners: boolean }
  | { status: 'refused'; reason: ResolveRefusal };

export interface ResolveBetRow {
  id: string;
  creatorId?: string | null;
  status?: string | null;
  winningSide?: string | null;
  updatedAt?: string | null;
  title?: string | null;
}

/** Why the caller cannot resolve this bet now, or null when they can. */
export function checkResolve(bet: ResolveBetRow | null | undefined, userId: string, winningSide: string): ResolveRefusal | null {
  if (!bet) return 'NOT_FOUND';
  if (bet.creatorId !== userId) return 'NOT_CREATOR';
  // The app offers Resolve on an ACTIVE bet, and on one awaiting a winner (expired, ended
  // early, or sent back by an upheld dispute). Never on one that already has a winner.
  const awaiting = bet.status === 'PENDING_RESOLUTION' && !bet.winningSide;
  if (bet.status !== 'ACTIVE' && !awaiting) return 'NOT_RESOLVABLE';
  if (winningSide !== 'A' && winningSide !== 'B') return 'INVALID_SIDE';
  return null;
}

export interface ExistingLedgerRow {
  id: string;
  type?: string | null;
  status?: string | null;
}

export interface ResolvePlan {
  disputeWindowEndsAt: string;
  winners: number;
  refundedNoWinners: boolean;
  /** Every write. The first item is the bet; it must commit with or before the rest. */
  entries: LedgerEntry[];
  stateUpdates: StateUpdate[];
  /** Per participant, for the notifications: what they stand to receive (0 for a loss). */
  outcomes: Array<{ userId: string; won: boolean; net: number }>;
}

export function planResolve(params: {
  bet: ResolveBetRow & { creatorId: string };
  winningSide: 'A' | 'B';
  sideNames: { A?: string; B?: string };
  participants: SettlementParticipant[];
  proUserIds: Set<string>;
  /** Rows already recorded against this bet (a re-resolution after an upheld dispute). */
  existing: ExistingLedgerRow[];
  now: string;
}): ResolvePlan {
  const { bet, winningSide, sideNames, participants, proUserIds, existing, now } = params;
  const disputeWindowEndsAt = new Date(new Date(now).getTime() + DISPUTE_WINDOW_MS).toISOString();
  const winningName = sideNames[winningSide] || `Side ${winningSide}`;
  const title = bet.title ?? 'Bet';

  const settlement = planSettlement({
    betId: bet.id,
    betTitle: title,
    winningSide,
    sideNames,
    participants,
    proUserIds,
  });
  const payoutByParticipant = new Map(settlement.payouts.map((p) => [p.participantId, p]));
  const existingById = new Map(existing.map((row) => [row.id, row]));

  const stateUpdates: StateUpdate[] = [
    {
      table: 'Bet',
      id: bet.id,
      set: {
        status: 'PENDING_RESOLUTION',
        winningSide,
        resolutionReason: `Resolved by creator. Winner: ${winningName}`,
        disputeWindowEndsAt,
        resolvedAt: now,
      },
      // Nothing about the bet changed since it was read: no join, no other resolution
      expect: { status: bet.status, updatedAt: bet.updatedAt ?? null },
    },
  ];
  const entries: LedgerEntry[] = [];
  const outcomes: ResolvePlan['outcomes'] = [];
  const keepPending = new Set<string>();

  for (const participant of participants) {
    const payout = payoutByParticipant.get(participant.id);
    const won = Boolean(payout);

    // What the app shows on the participant (and the early-closure notice quotes). Any
    // acceptance was of an earlier result (one an upheld dispute overturned): it does not
    // carry over to this one.
    stateUpdates.push({
      table: 'Participant',
      id: participant.id,
      set: { payout: payout?.gross ?? 0, status: won ? 'ACCEPTED' : 'DECLINED', hasAcceptedResult: false },
    });

    if (payout) {
      // The winnings, recorded now and paid after the window. No balance moves here;
      // upsertPending refreshes a row left by an earlier resolution of this bet.
      keepPending.add(payoutTransactionId(participant.id));
      entries.push({
        transactionId: payoutTransactionId(participant.id),
        userId: participant.userId,
        type: 'BET_WON',
        delta: 0,
        amount: payout.gross,
        actualAmount: payout.net,
        platformFee: payout.fee,
        status: 'PENDING',
        mode: 'upsertPending',
        relatedBetId: bet.id,
        relatedParticipantId: participant.id,
        notes: `Bet winnings (pending 48h dispute window): ${title}`,
      });
      // A loss recorded for them by an earlier resolution no longer stands
      const oldLoss = existingById.get(lossTransactionId(participant.id));
      if (oldLoss && oldLoss.status === 'COMPLETED') {
        stateUpdates.push({
          table: 'Transaction',
          id: oldLoss.id,
          set: { status: 'CANCELLED', failureReason: 'Superseded by a new resolution' },
          expect: { status: 'COMPLETED' },
        });
      }
      outcomes.push({ userId: participant.userId, won: true, net: payout.net });
    } else if (!settlement.refundedNoWinners) {
      // A $0 record of the loss, written once. The phone wrote it through a call that also
      // rewrote the loser's balance with a value read moments earlier.
      if (!existingById.has(lossTransactionId(participant.id))) {
        entries.push({
          transactionId: lossTransactionId(participant.id),
          userId: participant.userId,
          type: 'BET_LOST',
          delta: 0,
          amount: 0,
          status: 'COMPLETED',
          mode: 'create',
          relatedBetId: bet.id,
          relatedParticipantId: participant.id,
          notes: `${title} - ${winningName} won`,
        });
      }
      outcomes.push({ userId: participant.userId, won: false, net: 0 });
    } else {
      outcomes.push({ userId: participant.userId, won: false, net: 0 });
    }
  }

  // Pending winnings recorded for someone who no longer wins (an earlier resolution, or a
  // row an old app version wrote with its own id and amounts) must not show or be paid
  for (const row of existing) {
    if (row.type === 'BET_WON' && row.status === 'PENDING' && !keepPending.has(row.id)) {
      stateUpdates.push({
        table: 'Transaction',
        id: row.id,
        set: { status: 'CANCELLED', failureReason: 'Superseded by the server-computed resolution' },
        expect: { status: 'PENDING' },
      });
    }
  }

  return {
    disputeWindowEndsAt,
    winners: settlement.payouts.length,
    refundedNoWinners: settlement.refundedNoWinners,
    entries,
    stateUpdates,
    outcomes,
  };
}
