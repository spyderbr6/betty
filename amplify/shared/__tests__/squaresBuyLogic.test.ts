import { describe, expect, it } from 'vitest';
import {
  checkBuy,
  MAX_SQUARES_PER_PURCHASE,
  planBuy,
  planLock,
  ownsAllRequested,
  purchaseIdFor,
  purchaseTransactionId,
  shuffledDigits,
  squareLabels,
} from '../squaresBuyLogic';

const NOW = '2026-10-05T12:00:00.000Z';
const game = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  title: 'Super Bowl',
  status: 'ACTIVE',
  pricePerSquare: 5,
  numbersAssigned: false,
  ...over,
});
const sq = (row: number, col: number) => ({ row, col });

describe('checkBuy', () => {
  const check = (over: Partial<Parameters<typeof checkBuy>[0]> = {}) =>
    checkBuy({ game: game(), squares: [sq(0, 0), sq(3, 7)], ownerName: 'Mom', taken: [], ...over });

  it('allows free squares on an open game', () => {
    expect(check()).toBeNull();
    expect(check({ game: game({ status: 'SETUP' }) })).toBeNull();
  });

  it('refuses a game that is locked, numbered, missing or has no price', () => {
    expect(check({ game: null })).toEqual({ reason: 'NOT_FOUND' });
    expect(check({ game: game({ status: 'LOCKED' }) })).toEqual({ reason: 'NOT_OPEN' });
    expect(check({ game: game({ numbersAssigned: true }) })).toEqual({ reason: 'NOT_OPEN' });
    expect(check({ game: game({ pricePerSquare: 0 }) })).toEqual({ reason: 'NOT_OPEN' });
  });

  it('refuses squares off the grid, repeated, or none at all', () => {
    expect(check({ squares: [sq(10, 0)] })).toEqual({ reason: 'INVALID_SQUARES' });
    expect(check({ squares: [sq(1.5, 0)] })).toEqual({ reason: 'INVALID_SQUARES' });
    expect(check({ squares: [sq(2, 2), sq(2, 2)] })).toEqual({ reason: 'INVALID_SQUARES' });
    expect(check({ squares: [] })).toEqual({ reason: 'INVALID_SQUARES' });
    expect(check({ squares: 'A1' })).toEqual({ reason: 'INVALID_SQUARES' });
  });

  it('caps one purchase below the transaction limit', () => {
    const many = Array.from({ length: MAX_SQUARES_PER_PURCHASE + 1 }, (_, i) => sq(Math.floor(i / 10), i % 10));
    expect(check({ squares: many })).toEqual({ reason: 'TOO_MANY' });
  });

  it('needs an owner name', () => {
    expect(check({ ownerName: '  ' })).toEqual({ reason: 'INVALID_OWNER' });
    expect(check({ ownerName: 'x'.repeat(51) })).toEqual({ reason: 'INVALID_OWNER' });
  });

  it('names the squares already sold', () => {
    expect(check({ taken: [sq(3, 7)] })).toEqual({ reason: 'SQUARE_TAKEN', taken: [{ row: 3, col: 7 }] });
  });
});

describe('planBuy', () => {
  const plan = planBuy({ game: game(), userId: 'u1', ownerName: ' Mom ', squares: [sq(3, 7), sq(0, 0)], now: NOW });

  it('debits the price of every square in one ledger row', () => {
    expect(plan.total).toBe(10);
    expect(plan.entries).toEqual([
      expect.objectContaining({
        transactionId: plan.transactionId,
        userId: 'u1',
        type: 'SQUARES_PURCHASE',
        delta: -10,
        amount: 10,
        mode: 'create',
        relatedSquaresGameId: 'g1',
        notes: 'Super Bowl - D8, A1',
      }),
    ]);
  });

  it('creates one row per square, only if that square is free', () => {
    const rows = plan.stateUpdates.filter((u) => u.table === 'SquaresPurchase');
    expect(rows.map((r) => [r.id, r.create])).toEqual([
      ['g1#3-7', { typename: 'SquaresPurchase' }],
      ['g1#0-0', { typename: 'SquaresPurchase' }],
    ]);
    expect(rows[0].set).toEqual({
      squaresGameId: 'g1',
      userId: 'u1',
      gridRow: 3,
      gridCol: 7,
      ownerName: 'Mom',
      amount: 5,
      transactionId: plan.transactionId,
      purchasedAt: NOW,
    });
  });

  it('counts the sale on the game only while it is still taking purchases', () => {
    const update = plan.stateUpdates.find((u) => u.table === 'SquaresGame');
    expect(update).toMatchObject({ id: 'g1', add: { squaresSold: 2, totalPot: 10 }, expect: { status: 'ACTIVE' } });
  });

  it('gives a square the same row id whoever buys it, so it can be sold once', () => {
    expect(purchaseIdFor('g1', sq(3, 7))).toBe('g1#3-7');
  });

  it('gives the same purchase the same ledger id, whatever order the squares came in', () => {
    expect(purchaseTransactionId('g1', 'u1', [sq(0, 0), sq(3, 7)])).toBe(purchaseTransactionId('g1', 'u1', [sq(3, 7), sq(0, 0)]));
    expect(purchaseTransactionId('g1', 'u1', [sq(0, 0)])).not.toBe(purchaseTransactionId('g1', 'u2', [sq(0, 0)]));
  });
});

describe('ownsAllRequested', () => {
  const purchases = [
    { row: 0, col: 0, userId: 'u1' },
    { row: 3, col: 7, userId: 'u1' },
    { row: 5, col: 5, userId: 'u2' },
  ];

  it('recognises a repeat of the buyer\'s own purchase', () => {
    expect(ownsAllRequested([sq(3, 7), sq(0, 0)], purchases, 'u1')).toBe(true);
  });

  it('is not a repeat when any square is someone else\'s or still free', () => {
    expect(ownsAllRequested([sq(0, 0), sq(5, 5)], purchases, 'u1')).toBe(false);
    expect(ownsAllRequested([sq(0, 0), sq(9, 9)], purchases, 'u1')).toBe(false);
    expect(ownsAllRequested([sq(5, 5)], purchases, 'u1')).toBe(false);
    expect(ownsAllRequested([], purchases, 'u1')).toBe(false);
  });
});

describe('squareLabels', () => {
  it('lists up to three squares and counts more', () => {
    expect(squareLabels([sq(0, 0), sq(9, 9)])).toBe('A1, J10');
    expect(squareLabels([sq(0, 0), sq(0, 1), sq(0, 2), sq(0, 3)])).toBe('4 squares');
  });
});

describe('locking a full grid', () => {
  it('draws each digit exactly once, from the random source given', () => {
    let calls = 0;
    const digits = shuffledDigits((max) => {
      calls++;
      return max - 1; // a fixed source still yields a permutation
    });
    expect([...digits].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(calls).toBe(9);
  });

  it('numbers the grid and stops sales, only if it is still open and unnumbered', () => {
    const lock = planLock('g1', () => 0);
    expect(lock).toMatchObject({
      table: 'SquaresGame',
      id: 'g1',
      set: { numbersAssigned: true, status: 'LOCKED' },
      expect: { status: 'ACTIVE', numbersAssigned: false },
    });
    expect((lock.set.rowNumbers as number[]).length).toBe(10);
    expect((lock.set.colNumbers as number[]).length).toBe(10);
  });
});
