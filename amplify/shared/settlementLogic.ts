/**
 * Settlement: what each participant of a resolved bet is paid, computed on the server.
 *
 * The old flow computed payouts on the creator's phone (ResolveScreen) and wrote them as
 * PENDING transactions, and the payout Lambda credited whatever amounts those rows held.
 * Here the amounts come from the participant rows and the bet's winning side, and the
 * fee from the same function the app uses (src/config/subscriptionConfig), so the server
 * and the app cannot disagree about fees.
 *
 * Pure, so it is unit tested; the money Lambda reads the rows and applies the result
 * through the ledger.
 */

import { netWinnings, winningsFee } from '../../src/config/subscriptionConfig';
import { roundMoney, toCents, type LedgerEntry } from './ledgerLogic';

export interface SettlementParticipant {
  id: string;
  userId: string;
  side: string;
  amount: number;
}

export interface SettlementInput {
  betId: string;
  betTitle: string;
  winningSide: string;
  /** Display names of the sides, for the history notes. */
  sideNames?: { A?: string; B?: string };
  participants: SettlementParticipant[];
  /** Participants whose owners are Pro: their winnings fee is waived. */
  proUserIds: Set<string>;
}

export interface Payout {
  participantId: string;
  userId: string;
  gross: number;
  fee: number;
  net: number;
}

export interface SettlementPlan {
  /** Ledger entries, one per participant with money or a record to show. */
  entries: LedgerEntry[];
  payouts: Payout[];
  /** True when nobody backed the winning side and every stake is returned instead. */
  refundedNoWinners: boolean;
}

/** Ledger row ids. Deterministic, so settling twice cannot pay twice. */
export const payoutTransactionId = (participantId: string) => `payout#${participantId}`;
export const lossTransactionId = (participantId: string) => `loss#${participantId}`;
export const refundTransactionId = (participantId: string) => `refund#${participantId}`;

/**
 * Winners share the whole pot in proportion to their stakes; a winner's payout includes
 * their own stake back. The pot is the sum of the stakes actually placed, not the bet's
 * totalPot field (which clients could write). If nobody backed the winning side, every
 * stake is returned: the old code paid nobody and kept the pot.
 *
 * Rounding: shares are computed in cents and the last winner absorbs the remainder, so the
 * payouts always add up to exactly the pot.
 */
export function planSettlement(input: SettlementInput): SettlementPlan {
  const { betId, betTitle, winningSide, participants, proUserIds } = input;
  const winningName = input.sideNames?.[winningSide as 'A' | 'B'] ?? winningSide;

  const potCents = participants.reduce((sum, p) => sum + toCents(p.amount), 0);
  const winners = participants.filter((p) => p.side === winningSide && p.amount > 0);
  const winnerStakeCents = winners.reduce((sum, p) => sum + toCents(p.amount), 0);

  if (winners.length === 0 || winnerStakeCents === 0) {
    return {
      refundedNoWinners: true,
      payouts: [],
      entries: participants
        .filter((p) => p.amount > 0)
        .map((p) => ({
          transactionId: refundTransactionId(p.id),
          userId: p.userId,
          type: 'BET_CANCELLED' as const,
          delta: roundMoney(p.amount),
          amount: roundMoney(p.amount),
          status: 'COMPLETED' as const,
          mode: 'create' as const,
          relatedBetId: betId,
          relatedParticipantId: p.id,
          notes: `${betTitle} - nobody backed ${winningName}, stake returned`,
        })),
    };
  }

  // Each winner's gross share, in cents; the last absorbs rounding
  const payouts: Payout[] = [];
  let allocated = 0;
  winners.forEach((w, index) => {
    const grossCents =
      index === winners.length - 1
        ? potCents - allocated
        : Math.floor((potCents * toCents(w.amount)) / winnerStakeCents);
    allocated += grossCents;
    const gross = grossCents / 100;
    const isPro = proUserIds.has(w.userId);
    payouts.push({
      participantId: w.id,
      userId: w.userId,
      gross,
      fee: winningsFee(gross, isPro),
      net: netWinnings(gross, isPro),
    });
  });

  const entries: LedgerEntry[] = payouts.map((p) => ({
    transactionId: payoutTransactionId(p.participantId),
    userId: p.userId,
    type: 'BET_WON',
    delta: p.net,
    amount: p.gross,
    actualAmount: p.net,
    platformFee: p.fee,
    status: 'COMPLETED',
    // Resolution records the payout as PENDING under this id; settlement completes it,
    // or creates it if resolution happened before this code existed
    mode: 'upsertPending',
    relatedBetId: betId,
    relatedParticipantId: p.participantId,
    notes: `${betTitle} - ${winningName} won`,
  }));

  return { entries, payouts, refundedNoWinners: false };
}
