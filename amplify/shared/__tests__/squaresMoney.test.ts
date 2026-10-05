import { describe, expect, it } from 'vitest';
import {
  calculatePayout,
  checkSquaresCancel,
  periodsToSettle,
  settledPeriodCount,
  cancelSquaresGame,
  periodPayoutEntry,
  potFromPurchases,
  refundsByUser,
  squaresPayoutRecordId,
  squaresPayoutTransactionId,
} from '../squaresMoney';
import { WINNINGS_FEE_RATE } from '../../../src/config/subscriptionConfig';
import type { ApplyLedger } from '../cancelWithRefunds';
import type { LedgerEntry, LedgerResult, StateUpdate } from '../ledgerLogic';

const purchase = (userId: string, amount: number) => ({ id: `${userId}-${amount}-${Math.random()}`, userId, amount });

function fakeLedger(answers: LedgerResult[]) {
  const calls: Array<{ entries: LedgerEntry[]; stateUpdates: StateUpdate[] }> = [];
  const apply: ApplyLedger = async (entries, stateUpdates = []) => {
    calls.push({ entries, stateUpdates });
    return answers.shift() ?? { status: 'applied', balances: [] };
  };
  return { apply, calls };
}

describe('potFromPurchases', () => {
  it('sums what buyers paid, without floating-point drift', () => {
    expect(potFromPurchases([purchase('a', 0.1), purchase('b', 0.2)])).toBe(0.3);
  });

  it('is 0 with no purchases', () => {
    expect(potFromPurchases([])).toBe(0);
  });
});

describe('refundsByUser', () => {
  it('gives each buyer back the total of their purchases, once', () => {
    expect(refundsByUser([purchase('b', 5), purchase('a', 5), purchase('b', 5)])).toEqual([
      { userId: 'a', amount: 5 },
      { userId: 'b', amount: 10 },
    ]);
  });

  it('leaves out rows with no buyer or no amount', () => {
    expect(refundsByUser([{ id: 'x', userId: null, amount: 5 }, purchase('a', 0)])).toEqual([]);
  });
});

describe('calculatePayout', () => {
  const structure = { period1: 0.15, period2: 0.25, period3: 0.15, period4: 0.45 };

  it('pays the period share of the pot', () => {
    expect(calculatePayout(2, 100, structure)).toBe(25);
  });

  it('pays overtime periods at the final period share', () => {
    expect(calculatePayout(5, 100, structure)).toBe(45);
    expect(calculatePayout(6, 100, structure)).toBe(45);
  });

  it('returns 0 for a missing structure or share, so nothing is paid', () => {
    expect(calculatePayout(1, 100, null)).toBe(0);
    expect(calculatePayout(1, 100, { period2: 0.5 })).toBe(0);
  });
});

describe('periodPayoutEntry', () => {
  it('pays net of the fee, under one fixed id per game and period', () => {
    const entry = periodPayoutEntry({ gameId: 'g1', period: 'PERIOD_1', gross: 100, userId: 'u1', isPro: false });
    const fee = Math.round(100 * WINNINGS_FEE_RATE * 100) / 100;
    expect(entry).toMatchObject({
      transactionId: 'squares-payout#g1#PERIOD_1',
      userId: 'u1',
      type: 'SQUARES_PAYOUT',
      amount: 100,
      platformFee: fee,
      delta: 100 - fee,
      actualAmount: 100 - fee,
      mode: 'create',
      relatedSquaresGameId: 'g1',
    });
  });

  it('waives the fee for Pro', () => {
    const entry = periodPayoutEntry({ gameId: 'g1', period: 'PERIOD_4', gross: 45, userId: 'u1', isPro: true });
    expect(entry).toMatchObject({ platformFee: 0, delta: 45 });
  });

  it('uses the same id whoever the winner is, so a period can only be paid once', () => {
    const a = periodPayoutEntry({ gameId: 'g1', period: 'PERIOD_2', gross: 10, userId: 'u1', isPro: false });
    const b = periodPayoutEntry({ gameId: 'g1', period: 'PERIOD_2', gross: 12, userId: 'u2', isPro: true });
    expect(a.transactionId).toBe(b.transactionId);
    expect(a.transactionId).toBe(squaresPayoutTransactionId('g1', 'PERIOD_2'));
    expect(squaresPayoutRecordId('g1', 'PERIOD_2')).toBe('g1#PERIOD_2');
  });
});

describe('periodsToSettle', () => {
  const plan = (home: number[], away: number[], eventFinished: boolean, paid: string[] = []) =>
    periodsToSettle({ homeScores: home, awayScores: away, eventFinished, paid: new Set(paid) });

  it('pays periods 1-3 as their scores come in', () => {
    expect(plan([7, 10], [3, 14], false)).toEqual([
      { period: 1, scoreIndex: 0 },
      { period: 2, scoreIndex: 1 },
    ]);
  });

  it('holds the final share until the game is over', () => {
    expect(plan([7, 10, 17, 24], [3, 14, 17, 24], false, ['PERIOD_1', 'PERIOD_2', 'PERIOD_3'])).toEqual([]);
  });

  it('pays the final share on the final score when the game ends in regulation', () => {
    expect(plan([7, 10, 17, 24], [3, 14, 17, 21], true, ['PERIOD_1', 'PERIOD_2', 'PERIOD_3'])).toEqual([{ period: 4, scoreIndex: 3 }]);
  });

  it('pays the final share once, on the overtime score, and never pays overtime itself', () => {
    // Tied 24-24 after regulation, 30-24 after overtime: the final share follows 30-24
    expect(plan([7, 10, 17, 24, 30], [3, 14, 17, 24, 24], true, ['PERIOD_1', 'PERIOD_2', 'PERIOD_3'])).toEqual([{ period: 4, scoreIndex: 4 }]);
    expect(plan([7, 10, 17, 24, 27, 30], [3, 14, 17, 24, 27, 27], true, ['PERIOD_1', 'PERIOD_2', 'PERIOD_3'])).toEqual([{ period: 4, scoreIndex: 5 }]);
  });

  it('pays nothing already recorded, and nothing for a final that never arrived', () => {
    expect(plan([7, 10, 17, 24], [3, 14, 17, 24], true, ['PERIOD_1', 'PERIOD_2', 'PERIOD_3', 'PERIOD_4'])).toEqual([]);
    expect(plan([7, 10, 17], [3, 14, 17], true, ['PERIOD_1', 'PERIOD_2', 'PERIOD_3'])).toEqual([]);
  });

  it('never pays out more than the pot: four shares at most, each once', () => {
    const shares = { period1: 0.15, period2: 0.25, period3: 0.15, period4: 0.45 };
    const settled = plan([7, 10, 17, 24, 30, 33], [3, 14, 17, 24, 24, 24], true);
    const total = settled.reduce((sum, s) => sum + calculatePayout(s.period, 100, shares), 0);
    expect(total).toBe(100);
  });

  it('only periods 1-4 count towards resolving the game', () => {
    expect(settledPeriodCount([{ period: 'PERIOD_1' }, { period: 'PERIOD_2' }, { period: 'PERIOD_5' }, { period: 'PERIOD_2' }])).toBe(2);
  });
});

describe('checkSquaresCancel', () => {
  const game = (over: Record<string, unknown> = {}) => ({ creatorId: 'creator', status: 'ACTIVE', ...over });

  it('lets the creator or an admin cancel before the game goes live', () => {
    expect(checkSquaresCancel(game(), 'creator', false, 0)).toBeNull();
    expect(checkSquaresCancel(game({ status: 'LOCKED' }), 'someone', true, 0)).toBeNull();
  });

  it('refuses anyone else', () => {
    expect(checkSquaresCancel(game(), 'someone', false, 0)).toBe('NOT_ALLOWED');
    expect(checkSquaresCancel(null, 'creator', false, 0)).toBe('NOT_FOUND');
  });

  it('refuses the creator once the game is live, finished or cancelled', () => {
    for (const status of ['LIVE', 'PENDING_RESOLUTION', 'RESOLVED', 'CANCELLED']) {
      expect(checkSquaresCancel(game({ status }), 'creator', false, 0)).toBe('NOT_CANCELLABLE');
    }
  });

  it('lets an admin release a live or stuck game, but not a finished one', () => {
    expect(checkSquaresCancel(game({ status: 'LIVE' }), 'admin', true, 0)).toBeNull();
    expect(checkSquaresCancel(game({ status: 'PENDING_RESOLUTION' }), 'admin', true, 0)).toBeNull();
    expect(checkSquaresCancel(game({ status: 'RESOLVED' }), 'admin', true, 0)).toBe('NOT_CANCELLABLE');
    expect(checkSquaresCancel(game({ status: 'CANCELLED' }), 'admin', true, 0)).toBe('NOT_CANCELLABLE');
    // ...and never once a period has paid
    expect(checkSquaresCancel(game({ status: 'PENDING_RESOLUTION' }), 'admin', true, 2)).toBe('ALREADY_PAID');
  });

  it('refuses once any period has paid, which would pay those winners twice', () => {
    expect(checkSquaresCancel(game({ status: 'LOCKED' }), 'creator', false, 1)).toBe('ALREADY_PAID');
  });
});

describe('cancelSquaresGame', () => {
  it('refunds every buyer and cancels the game in one transaction, guarded on its status', async () => {
    const { apply, calls } = fakeLedger([{ status: 'applied', balances: [] }]);
    const { outcome, refunds } = await cancelSquaresGame(apply, 'g1', 'LOCKED', [purchase('a', 5), purchase('a', 5), purchase('b', 5)], 'Event not found');

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(refunds).toEqual([{ userId: 'a', amount: 10 }, { userId: 'b', amount: 5 }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].entries.map((e) => [e.transactionId, e.type, e.delta])).toEqual([
      ['squares-refund#g1#a', 'SQUARES_REFUND', 10],
      ['squares-refund#g1#b', 'SQUARES_REFUND', 5],
    ]);
    expect(calls[0].stateUpdates).toEqual([
      { table: 'SquaresGame', id: 'g1', set: { status: 'CANCELLED', resolutionReason: 'Event not found' }, expect: { status: 'LOCKED' } },
    ]);
  });

  it('cancels a game nobody bought into', async () => {
    const { apply, calls } = fakeLedger([{ status: 'applied', balances: [] }]);
    const { outcome, refunds } = await cancelSquaresGame(apply, 'g1', 'ACTIVE', [], 'No squares purchased');
    expect(outcome.status).toBe('cancelled');
    expect(refunds).toEqual([]);
    expect(calls[0].entries).toEqual([]);
  });

  it('reports no refunds when the game had already moved on', async () => {
    const { apply } = fakeLedger([{ status: 'state_changed' }]);
    const { outcome, refunds } = await cancelSquaresGame(apply, 'g1', 'ACTIVE', [purchase('a', 5)], 'r');
    expect(outcome.status).toBe('skipped');
    expect(refunds).toEqual([]);
  });

  it('does not refund again when a run repeats', async () => {
    // A repeat finds the refund rows written and only confirms the cancellation
    const { apply, calls } = fakeLedger([{ status: 'already_applied' }, { status: 'state_changed' }]);
    const { outcome } = await cancelSquaresGame(apply, 'g1', 'ACTIVE', [purchase('a', 5)], 'r');
    expect(outcome.status).toBe('skipped');
    expect(calls[1].entries).toEqual([]);
  });
});
