import { describe, expect, it } from 'vitest';
import { buyFailureMessage, cancelFailureMessage, parseMoneyResult, type BuyResult } from '../squaresMoneyLogic';

describe('parseMoneyResult', () => {
  it('reads an expected answer as an object or JSON text, and nothing else', () => {
    const bought = { status: 'bought', squares: 2, total: 10, balance: 40, locked: false };
    expect(parseMoneyResult(bought, ['bought', 'refused'])).toEqual(bought);
    expect(parseMoneyResult(JSON.stringify(JSON.stringify(bought)), ['bought', 'refused'])).toEqual(bought);
    expect(parseMoneyResult({ status: 'cancelled' }, ['bought', 'refused'])).toBeNull();
    expect(parseMoneyResult('nope', ['bought'])).toBeNull();
  });
});

describe('buyFailureMessage', () => {
  const refused = (over: Partial<Extract<BuyResult, { status: 'refused' }>>) =>
    ({ status: 'refused', reason: 'BUSY', ...over }) as BuyResult;

  it('states the cost and the balance when the balance is short', () => {
    expect(buyFailureMessage(refused({ reason: 'INSUFFICIENT_FUNDS', required: 10, balance: 4 }))).toBe(
      'You need $10.00 for these squares, but your balance is $4.00.'
    );
  });

  it('names the squares someone else just bought, as the grid labels them', () => {
    expect(buyFailureMessage(refused({ reason: 'SQUARE_TAKEN', taken: [{ row: 0, col: 0 }, { row: 3, col: 7 }] }))).toContain('A1, D8');
  });

  it('explains a closed game, and falls back for a failed call', () => {
    expect(buyFailureMessage(refused({ reason: 'NOT_OPEN' }))).toContain('no longer accepting');
    expect(buyFailureMessage(null)).toBe('Failed to purchase squares. Please try again.');
  });
});

describe('cancelFailureMessage', () => {
  it('explains why a game cannot be cancelled', () => {
    expect(cancelFailureMessage({ status: 'refused', reason: 'ALREADY_PAID' })).toContain('pay those winners twice');
    expect(cancelFailureMessage({ status: 'refused', reason: 'NOT_ALLOWED' })).toContain('Only the game creator or an admin');
    expect(cancelFailureMessage(null)).toBe('Failed to cancel the game. Please try again.');
  });
});
