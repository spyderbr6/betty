/**
 * Squares money: period payouts and refunds, as ledger entries (docs/SECURITY_PLAN.md).
 * Kept apart from the handler so it is tested; the handler cannot be imported by a test.
 *
 * What changed from the old handler, which read a balance, added and wrote it back:
 * - Every movement has a fixed id (one payout per game and period, one refund per game
 *   and buyer), so an overlapping or repeated run cannot pay or refund twice.
 * - The pot is the sum of the purchases, not the game's totalPot field, which buyers'
 *   phones write with a read-then-write and which any signed-in user can change.
 * - The fee and Pro come from the app's own functions (src/config/subscriptionConfig).
 *   The handler kept a copy of the rate and counted only ACTIVE Pro, so members on a
 *   trial were charged.
 */

import { netWinnings, winningsFee } from '../../../src/config/subscriptionConfig';
import { toCents, type LedgerEntry } from '../../shared/ledgerLogic';
import { cancelWithRefunds, type ApplyLedger, type CancelOutcome } from '../../shared/cancelWithRefunds';

export interface PurchaseRow {
  id?: string | null;
  userId?: string | null;
  amount?: number | null;
}

export type SquaresPeriod = 'PERIOD_1' | 'PERIOD_2' | 'PERIOD_3' | 'PERIOD_4' | 'PERIOD_5' | 'PERIOD_6';

/** Ledger row ids. Deterministic, so a repeated run cannot move money twice. */
export const squaresPayoutTransactionId = (gameId: string, period: SquaresPeriod) => `squares-payout#${gameId}#${period}`;
export const squaresRefundTransactionId = (gameId: string, userId: string) => `squares-refund#${gameId}#${userId}`;

/** SquaresPayout record id, one per game and period, so overlapping runs cannot record a period twice. */
export const squaresPayoutRecordId = (gameId: string, period: SquaresPeriod) => `${gameId}#${period}`;

/** The pot: what the buyers paid, summed in cents. */
export function potFromPurchases(purchases: PurchaseRow[]): number {
  return purchases.reduce((sum, p) => sum + toCents(p.amount ?? 0), 0) / 100;
}

/** Each buyer's total, in cents then dollars; buyers who paid nothing are left out. */
export function refundsByUser(purchases: PurchaseRow[]): Array<{ userId: string; amount: number }> {
  const cents = new Map<string, number>();
  for (const p of purchases) {
    if (!p.userId) continue;
    cents.set(p.userId, (cents.get(p.userId) ?? 0) + toCents(p.amount ?? 0));
  }
  return [...cents]
    .filter(([, c]) => c > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([userId, c]) => ({ userId, amount: c / 100 }));
}

/**
 * A period's gross payout: the pot times that period's share. Overtime periods (5-6) use
 * period 4's share, as they decide the final score. 0 when no share is defined, which the
 * caller treats as "do not pay".
 */
export function calculatePayout(period: number, pot: number, payoutStructure: Record<string, unknown> | null | undefined): number {
  if (!payoutStructure) return 0;
  const shares = [
    payoutStructure.period1,
    payoutStructure.period2,
    payoutStructure.period3,
    payoutStructure.period4,
    payoutStructure.period4,
    payoutStructure.period4,
  ];
  const share = Number(shares[period - 1]);
  if (!Number.isFinite(share) || share <= 0) return 0;
  return Math.round(pot * share * 100) / 100;
}

export function periodPayoutEntry(params: {
  gameId: string;
  period: SquaresPeriod;
  gross: number;
  userId: string;
  isPro: boolean;
}): LedgerEntry {
  const { gameId, period, gross, userId, isPro } = params;
  const fee = winningsFee(gross, isPro);
  const net = netWinnings(gross, isPro);
  return {
    transactionId: squaresPayoutTransactionId(gameId, period),
    userId,
    type: 'SQUARES_PAYOUT',
    delta: net,
    amount: gross,
    actualAmount: net,
    platformFee: fee,
    status: 'COMPLETED',
    mode: 'create',
    relatedSquaresGameId: gameId,
    notes: `${period} winner payout`,
  };
}

export function refundEntries(gameId: string, purchases: PurchaseRow[], reason: string): LedgerEntry[] {
  return refundsByUser(purchases).map(({ userId, amount }) => ({
    transactionId: squaresRefundTransactionId(gameId, userId),
    userId,
    type: 'SQUARES_REFUND',
    delta: amount,
    amount,
    status: 'COMPLETED',
    mode: 'create',
    relatedSquaresGameId: gameId,
    notes: `Game cancelled - refund (${reason})`,
  }));
}

/**
 * Cancel a game and refund every buyer, in one ledger transaction with the game's status
 * change, guarded on the status the game was read with. Some cancellations used to refund
 * nobody: a LOCKED game whose event disappeared, and an ACTIVE game whose sold count read
 * 0 while purchases existed.
 */
export async function cancelSquaresGame(
  apply: ApplyLedger,
  gameId: string,
  expectedStatus: string,
  purchases: PurchaseRow[],
  reason: string
): Promise<{ outcome: CancelOutcome; refunds: Array<{ userId: string; amount: number }> }> {
  const outcome = await cancelWithRefunds(
    apply,
    {
      table: 'SquaresGame',
      id: gameId,
      set: { status: 'CANCELLED', resolutionReason: reason },
      expect: { status: expectedStatus },
    },
    refundEntries(gameId, purchases, reason)
  );
  return { outcome, refunds: outcome.status === 'cancelled' ? refundsByUser(purchases) : [] };
}
