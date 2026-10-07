/**
 * Buying squares and locking a full grid, decided and written on the server
 * (docs/SECURITY_PLAN.md step 3).
 *
 * The buyer's phone used to do it: check the squares were free, create the purchase rows,
 * then debit the balance in a separate call, then update the game's counts with a
 * read-then-write. A failed or skipped debit left squares owned but unpaid (they still won
 * and were still refunded), two buyers could take the same square, and the buyer who
 * filled the grid generated the row and column numbers that decide every winner on their
 * own phone. Here the server checks the purchase, and the purchase rows, the debit and the
 * game's counts are one ledger transaction; each square's row has a fixed id, so a square
 * can only be sold once. The numbers are drawn on the server.
 *
 * Pure, so it is unit tested; the money function reads the rows and applies the plan.
 */

import { roundMoney, toCents, type LedgerEntry, type StateUpdate } from './ledgerLogic';
import { isValidPayoutStructure } from './squaresMoney';

export type BuyRefusal =
  | 'NOT_FOUND'
  | 'NOT_OPEN'
  | 'INVALID_SQUARES'
  | 'TOO_MANY'
  | 'SQUARE_TAKEN'
  | 'INVALID_OWNER'
  | 'INSUFFICIENT_FUNDS'
  | 'BUSY';

export type BuyResult =
  | { status: 'bought'; squares: number; total: number; balance: number; locked: boolean }
  | { status: 'refused'; reason: BuyRefusal; balance?: number; required?: number; taken?: Array<{ row: number; col: number }> };

export interface BuyGameRow {
  id: string;
  title?: string | null;
  status?: string | null;
  pricePerSquare?: number | null;
  numbersAssigned?: boolean | null;
  payoutStructure?: unknown;
}

export interface Square {
  row: number;
  col: number;
}

/**
 * At most this many squares in one purchase: each is a row in the same transaction as
 * the debit and the game, under DynamoDB's 100 items.
 */
export const MAX_SQUARES_PER_PURCHASE = 90;
export const MAX_OWNER_NAME = 50;

/** One row per square: the fixed id is what stops a square being sold twice. */
export const purchaseIdFor = (gameId: string, square: Square) => `${gameId}#${square.row}-${square.col}`;

const cellCode = (s: Square) => `${s.row}${s.col}`;

/** The ledger row for one purchase; the same squares always give the same id. */
export function purchaseTransactionId(gameId: string, userId: string, squares: Square[]): string {
  return `squares-buy#${gameId}#${userId}#${squares.map(cellCode).sort().join('.')}`;
}

/** Why this purchase cannot happen, or null when it can. */
export function checkBuy(params: {
  game: BuyGameRow | null | undefined;
  squares: unknown;
  ownerName: unknown;
  /** Squares already sold, from the game's purchase rows. */
  taken: Square[];
}): { reason: BuyRefusal; taken?: Square[] } | null {
  const { game, squares, ownerName, taken } = params;
  if (!game) return { reason: 'NOT_FOUND' };
  if ((game.status !== 'ACTIVE' && game.status !== 'SETUP') || game.numbersAssigned === true) return { reason: 'NOT_OPEN' };
  if (!(typeof game.pricePerSquare === 'number' && game.pricePerSquare > 0)) return { reason: 'NOT_OPEN' };
  // A game that could not pay out what it takes in takes nothing (the creator wrote it)
  if (!isValidPayoutStructure(game.payoutStructure)) return { reason: 'NOT_OPEN' };

  if (!Array.isArray(squares) || squares.length === 0) return { reason: 'INVALID_SQUARES' };
  if (squares.length > MAX_SQUARES_PER_PURCHASE) return { reason: 'TOO_MANY' };
  const seen = new Set<string>();
  for (const s of squares as Square[]) {
    const ok = s && Number.isInteger(s.row) && Number.isInteger(s.col) && s.row >= 0 && s.row <= 9 && s.col >= 0 && s.col <= 9;
    if (!ok || seen.has(cellCode(s))) return { reason: 'INVALID_SQUARES' };
    seen.add(cellCode(s));
  }

  if (typeof ownerName !== 'string' || !ownerName.trim() || ownerName.trim().length > MAX_OWNER_NAME) {
    return { reason: 'INVALID_OWNER' };
  }

  const takenCodes = new Set(taken.map(cellCode));
  const clashes = (squares as Square[]).filter((s) => takenCodes.has(cellCode(s)));
  if (clashes.length) return { reason: 'SQUARE_TAKEN', taken: clashes.map((s) => ({ row: s.row, col: s.col })) };
  return null;
}

/**
 * Whether every requested square is already this user's: a repeat of a purchase that went
 * through (its answer lost, say), to be answered as bought rather than as taken. The caller
 * also confirms the purchase's ledger row exists, so this is that exact purchase.
 */
export function ownsAllRequested(squares: unknown, purchases: Array<Square & { userId: string }>, userId: string): boolean {
  if (!Array.isArray(squares) || squares.length === 0) return false;
  const mine = new Set(purchases.filter((p) => p.userId === userId).map(cellCode));
  return (squares as Square[]).every((s) => s && mine.has(cellCode(s)));
}

/** "A3, B5" for a few squares, "12 squares" for more (the history line the app wrote). */
export function squareLabels(squares: Square[]): string {
  if (squares.length > 3) return `${squares.length} squares`;
  return squares.map((s) => `${String.fromCharCode(65 + s.row)}${s.col + 1}`).join(', ');
}

/**
 * The single write: one purchase row per square (each created only if that square is
 * still free), the debit, and the game's counts, guarded on the game still taking
 * purchases. Assumes checkBuy passed.
 */
export function planBuy(params: {
  game: BuyGameRow & { pricePerSquare: number };
  userId: string;
  ownerName: string;
  squares: Square[];
  now: string;
}): { transactionId: string; total: number; entries: LedgerEntry[]; stateUpdates: StateUpdate[] } {
  const { game, userId, squares, now } = params;
  const ownerName = params.ownerName.trim();
  const price = roundMoney(game.pricePerSquare);
  const total = (toCents(price) * squares.length) / 100;
  const transactionId = purchaseTransactionId(game.id, userId, squares);

  return {
    transactionId,
    total,
    entries: [
      {
        transactionId,
        userId,
        type: 'SQUARES_PURCHASE',
        delta: -total,
        amount: total,
        status: 'COMPLETED',
        mode: 'create',
        relatedSquaresGameId: game.id,
        notes: `${game.title ?? 'Squares'} - ${squareLabels(squares)}`,
      },
    ],
    stateUpdates: [
      ...squares.map((s) => ({
        table: 'SquaresPurchase' as const,
        id: purchaseIdFor(game.id, s),
        create: { typename: 'SquaresPurchase' },
        set: {
          squaresGameId: game.id,
          userId,
          gridRow: s.row,
          gridCol: s.col,
          ownerName,
          amount: price,
          transactionId,
          // purchasesBySquaresGame sorts on purchasedAt: without it the row is not indexed
          purchasedAt: now,
        },
      })),
      {
        table: 'SquaresGame' as const,
        id: game.id,
        set: {},
        add: { squaresSold: squares.length, totalPot: total },
        expect: { status: game.status },
      },
    ],
  };
}

/** A fresh 0-9 order for the grid's rows or columns, from the random source given. */
export function shuffledDigits(randomInt: (maxExclusive: number) => number): number[] {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
}

/**
 * Lock a full grid: draw the numbers that decide the winners and stop sales, only if the
 * game is still open and unnumbered. The buyer who filled the grid used to draw them.
 */
export function planLock(gameId: string, randomInt: (maxExclusive: number) => number): StateUpdate {
  return {
    table: 'SquaresGame',
    id: gameId,
    set: {
      rowNumbers: shuffledDigits(randomInt),
      colNumbers: shuffledDigits(randomInt),
      numbersAssigned: true,
      status: 'LOCKED',
    },
    expect: { status: 'ACTIVE', numbersAssigned: false },
  };
}
