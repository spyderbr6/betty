import { describe, expect, it } from 'vitest';
import { checkResolve, planResolve } from '../resolveLogic';
import { WINNINGS_FEE_RATE } from '../../../src/config/subscriptionConfig';

const NOW = '2026-10-05T12:00:00.000Z';
const bet = (over: Record<string, unknown> = {}) => ({
  id: 'bet-1',
  creatorId: 'u-a',
  status: 'ACTIVE',
  winningSide: null,
  updatedAt: '2026-10-05T11:00:00.000Z',
  title: 'Chiefs win',
  ...over,
});
const p = (id: string, side: string, amount: number) => ({ id, userId: `u-${id}`, side, amount });

describe('checkResolve', () => {
  it('lets the creator resolve an open bet or one awaiting a winner', () => {
    expect(checkResolve(bet(), 'u-a', 'A')).toBeNull();
    expect(checkResolve(bet({ status: 'PENDING_RESOLUTION' }), 'u-a', 'B')).toBeNull();
  });

  it('refuses anyone but the creator', () => {
    expect(checkResolve(bet(), 'u-b', 'A')).toBe('NOT_CREATOR');
    expect(checkResolve(null, 'u-a', 'A')).toBe('NOT_FOUND');
  });

  it('refuses a bet that already has a winner, or is settled or cancelled', () => {
    expect(checkResolve(bet({ status: 'PENDING_RESOLUTION', winningSide: 'A' }), 'u-a', 'B')).toBe('NOT_RESOLVABLE');
    expect(checkResolve(bet({ status: 'RESOLVED' }), 'u-a', 'A')).toBe('NOT_RESOLVABLE');
    expect(checkResolve(bet({ status: 'CANCELLED' }), 'u-a', 'A')).toBe('NOT_RESOLVABLE');
  });

  it('refuses a side that is not A or B', () => {
    expect(checkResolve(bet(), 'u-a', 'C')).toBe('INVALID_SIDE');
  });
});

describe('planResolve', () => {
  const plan = (over: Partial<Parameters<typeof planResolve>[0]> = {}) =>
    planResolve({
      bet: bet() as Parameters<typeof planResolve>[0]['bet'],
      winningSide: 'A',
      sideNames: { A: 'Chiefs', B: 'Bills' },
      participants: [p('a', 'A', 10), p('b', 'B', 10), p('c', 'B', 10)],
      proUserIds: new Set(),
      existing: [],
      now: NOW,
      ...over,
    });

  it('sets the winner, a 48-hour window and the resolution time, only if the bet is unchanged', () => {
    const betUpdate = plan().stateUpdates[0];
    expect(betUpdate).toEqual({
      table: 'Bet',
      id: 'bet-1',
      set: {
        status: 'PENDING_RESOLUTION',
        winningSide: 'A',
        resolutionReason: 'Resolved by creator. Winner: Chiefs',
        disputeWindowEndsAt: '2026-10-07T12:00:00.000Z',
        resolvedAt: NOW,
      },
      expect: { status: 'ACTIVE', updatedAt: '2026-10-05T11:00:00.000Z' },
    });
  });

  it('records the winnings as PENDING from the stakes, with the server\'s fee, and moves no money', () => {
    const { entries } = plan();
    const won = entries.find((e) => e.type === 'BET_WON');
    const fee = Math.round(30 * WINNINGS_FEE_RATE * 100) / 100;
    expect(won).toMatchObject({
      transactionId: 'payout#a',
      userId: 'u-a',
      status: 'PENDING',
      mode: 'upsertPending',
      delta: 0,
      amount: 30,
      platformFee: fee,
      actualAmount: 30 - fee,
    });
    expect(entries.every((e) => e.delta === 0)).toBe(true);
  });

  it('waives the fee for a Pro winner (who is Pro is looked up on the server)', () => {
    const won = plan({ proUserIds: new Set(['u-a']) }).entries.find((e) => e.type === 'BET_WON');
    expect(won).toMatchObject({ amount: 30, platformFee: 0, actualAmount: 30 });
  });

  it('records each loss once, without touching the loser\'s balance', () => {
    const losses = plan().entries.filter((e) => e.type === 'BET_LOST');
    expect(losses.map((e) => [e.transactionId, e.delta, e.amount, e.mode])).toEqual([
      ['loss#b', 0, 0, 'create'],
      ['loss#c', 0, 0, 'create'],
    ]);
    // Re-resolving: a loss already recorded is not written again
    const again = plan({ existing: [{ id: 'loss#b', type: 'BET_LOST', status: 'COMPLETED' }] });
    expect(again.entries.filter((e) => e.type === 'BET_LOST').map((e) => e.transactionId)).toEqual(['loss#c']);
  });

  it('writes each participant\'s payout and outcome for the app', () => {
    const participants = plan().stateUpdates.filter((u) => u.table === 'Participant');
    expect(participants.map((u) => [u.id, u.set])).toEqual([
      ['a', { payout: 30, status: 'ACCEPTED', hasAcceptedResult: false }],
      ['b', { payout: 0, status: 'DECLINED', hasAcceptedResult: false }],
      ['c', { payout: 0, status: 'DECLINED', hasAcceptedResult: false }],
    ]);
  });

  it('cancels pending winnings that no longer stand, including rows an old app wrote', () => {
    const { stateUpdates } = plan({
      existing: [
        { id: 'payout#b', type: 'BET_WON', status: 'PENDING' }, // b won the overturned resolution
        { id: 'random-old-app-row', type: 'BET_WON', status: 'PENDING' },
        { id: 'payout#a', type: 'BET_WON', status: 'PENDING' }, // a still wins: refreshed, not cancelled
        { id: 'loss#a', type: 'BET_LOST', status: 'COMPLETED' }, // a lost the overturned one
      ],
    });
    const cancelled = stateUpdates.filter((u) => u.table === 'Transaction');
    expect(cancelled.map((u) => [u.id, u.set.status, u.expect])).toEqual([
      ['loss#a', 'CANCELLED', { status: 'COMPLETED' }],
      ['payout#b', 'CANCELLED', { status: 'PENDING' }],
      ['random-old-app-row', 'CANCELLED', { status: 'PENDING' }],
    ]);
  });

  it('when nobody backed the winner, records no winnings and no losses: the stakes come back', () => {
    const result = plan({ winningSide: 'B', participants: [p('a', 'A', 10)] });
    expect(result.refundedNoWinners).toBe(true);
    expect(result.entries).toEqual([]);
    expect(result.outcomes).toEqual([{ userId: 'u-a', won: false, net: 0 }]);
  });

  it('says what each participant stands to receive, for the notifications', () => {
    const fee = Math.round(30 * WINNINGS_FEE_RATE * 100) / 100;
    expect(plan().outcomes).toEqual([
      { userId: 'u-a', won: true, net: 30 - fee },
      { userId: 'u-b', won: false, net: 0 },
      { userId: 'u-c', won: false, net: 0 },
    ]);
  });
});
