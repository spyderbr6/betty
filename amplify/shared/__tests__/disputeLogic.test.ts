import { describe, expect, it } from 'vitest';
import { checkResolveDispute, planUphold } from '../disputeLogic';

const dispute = (over: Record<string, unknown> = {}) => ({ id: 'd1', betId: 'b1', status: 'PENDING', filedBy: 'filer', againstUserId: 'creator', ...over });
const bet = (over: Record<string, unknown> = {}) => ({ id: 'b1', status: 'PENDING_RESOLUTION', updatedAt: '2026-10-05T12:00:00.000Z', ...over });

describe('checkResolveDispute', () => {
  it('allows any outcome on an open dispute', () => {
    for (const outcome of ['RESOLVED_FOR_FILER', 'RESOLVED_FOR_CREATOR', 'DISMISSED']) {
      expect(checkResolveDispute({ dispute: dispute(), bet: bet(), outcome })).toBeNull();
    }
    expect(checkResolveDispute({ dispute: dispute({ status: 'UNDER_REVIEW' }), bet: bet(), outcome: 'DISMISSED' })).toBeNull();
  });

  it('refuses a dispute already decided, a missing one, or an unknown outcome', () => {
    expect(checkResolveDispute({ dispute: dispute({ status: 'DISMISSED' }), bet: bet(), outcome: 'DISMISSED' })).toBe('NOT_OPEN');
    expect(checkResolveDispute({ dispute: null, bet: bet(), outcome: 'DISMISSED' })).toBe('NOT_FOUND');
    expect(checkResolveDispute({ dispute: dispute(), bet: bet(), outcome: 'REFUND_EVERYONE' })).toBe('INVALID_OUTCOME');
  });

  it('refuses to uphold against a bet already paid, which would pay it twice', () => {
    expect(checkResolveDispute({ dispute: dispute(), bet: bet({ status: 'RESOLVED' }), outcome: 'RESOLVED_FOR_FILER' })).toBe('ALREADY_PAID');
    // Dismissing on a paid bet changes no money: allowed
    expect(checkResolveDispute({ dispute: dispute(), bet: bet({ status: 'RESOLVED' }), outcome: 'DISMISSED' })).toBeNull();
  });
});

describe('planUphold', () => {
  const updates = planUphold({
    bet: bet(),
    existing: [
      { id: 'payout#p1', type: 'BET_WON', status: 'PENDING' },
      { id: 'old-app-row', type: 'BET_WON', status: 'PENDING' },
      { id: 'loss#p2', type: 'BET_LOST', status: 'COMPLETED' },
      { id: 'stake#p1', type: 'BET_PLACED', status: 'COMPLETED' },
    ],
  });

  it('clears the winner and returns the bet to its creator, only if it is unchanged', () => {
    expect(updates[0]).toEqual({
      table: 'Bet',
      id: 'b1',
      set: { status: 'PENDING_RESOLUTION', winningSide: null },
      expect: { status: 'PENDING_RESOLUTION', updatedAt: '2026-10-05T12:00:00.000Z' },
    });
  });

  it('cancels every pending payout of the overturned result, and nothing else', () => {
    const cancelled = updates.filter((u) => u.table === 'Transaction');
    expect(cancelled.map((u) => [u.id, u.set.status, u.expect])).toEqual([
      ['payout#p1', 'CANCELLED', { status: 'PENDING' }],
      ['old-app-row', 'CANCELLED', { status: 'PENDING' }],
    ]);
  });
});
