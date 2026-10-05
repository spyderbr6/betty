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

import { netWinnings, winningsFee } from '../../src/config/subscriptionConfig';
import { toCents, type LedgerEntry } from './ledgerLogic';
import { cancelWithRefunds, type ApplyLedger, type CancelOutcome } from './cancelWithRefunds';

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

/** The payout periods: three as they finish, then the final score. */
export const FINAL_PERIOD = 4;

/**
 * Which periods to pay now, and the score each is paid on. Scores are running totals, one
 * per period played, overtime included.
 *
 * Periods 1-3 pay on their own score as soon as it is in. The final share (period 4's)
 * pays once, on the final score, and only once the game is over: if it goes to overtime,
 * the overtime score decides it. Overtime periods are never paid separately. They used to
 * be paid period 4's share again on top of period 4 itself, so a game that went to
 * overtime paid out 145% of the pot with the default split.
 */
export function periodsToSettle(params: {
  homeScores: number[];
  awayScores: number[];
  eventFinished: boolean;
  /** Periods already recorded (PERIOD_n). */
  paid: Set<string>;
}): Array<{ period: 1 | 2 | 3 | 4; scoreIndex: number }> {
  const { homeScores, awayScores, eventFinished, paid } = params;
  const played = Math.min(homeScores.length, awayScores.length);
  const settle: Array<{ period: 1 | 2 | 3 | 4; scoreIndex: number }> = [];
  for (const period of [1, 2, 3] as const) {
    if (played >= period && !paid.has(`PERIOD_${period}`)) settle.push({ period, scoreIndex: period - 1 });
  }
  if (eventFinished && played >= FINAL_PERIOD && !paid.has(`PERIOD_${FINAL_PERIOD}`)) {
    settle.push({ period: FINAL_PERIOD, scoreIndex: played - 1 });
  }
  return settle;
}

/** Recorded payouts that count towards a game's four (overtime periods are not payouts). */
export function settledPeriodCount(payouts: Array<{ period?: string | null }>): number {
  const periods = new Set(payouts.map((p) => p.period).filter((p) => /^PERIOD_[1-4]$/.test(p ?? '')));
  return periods.size;
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

export type SquaresCancelRefusal = 'NOT_FOUND' | 'NOT_ALLOWED' | 'NOT_CANCELLABLE' | 'ALREADY_PAID';

/** A creator may cancel their game until it goes live, as the game screen offers. */
const CREATOR_CANCELLABLE = ['ACTIVE', 'SETUP', 'LOCKED'];
/**
 * An admin may also cancel a live or stuck game: the admin squares tab is the only way to
 * release the money in a game whose scores never arrive (it waits in PENDING_RESOLUTION).
 */
const ADMIN_CANCELLABLE = [...CREATOR_CANCELLABLE, 'LIVE', 'PENDING_RESOLUTION'];

/**
 * Whether an app user may cancel a game (the cancelSquaresGame mutation): its creator
 * before it goes live, or an admin until it is resolved; never once a period has paid
 * out, since refunding every stake then pays those winners twice.
 */
export function checkSquaresCancel(
  game: { creatorId?: string | null; status?: string | null } | null | undefined,
  userId: string,
  isAdmin: boolean,
  payoutsRecorded: number
): SquaresCancelRefusal | null {
  if (!game) return 'NOT_FOUND';
  const isCreator = game.creatorId === userId;
  if (!isCreator && !isAdmin) return 'NOT_ALLOWED';
  const allowed = isAdmin ? ADMIN_CANCELLABLE : CREATOR_CANCELLABLE;
  if (!allowed.includes(game.status ?? '')) return 'NOT_CANCELLABLE';
  if (payoutsRecorded > 0) return 'ALREADY_PAID';
  return null;
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
