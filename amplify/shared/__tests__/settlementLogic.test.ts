import { describe, expect, it } from 'vitest';
import { hasOpenDispute, overturnedByDispute, planSettlement, type SettlementParticipant } from '../settlementLogic';
import { WINNINGS_FEE_RATE } from '../../../src/config/subscriptionConfig';

const p = (id: string, side: string, amount: number, userId = `u-${id}`): SettlementParticipant => ({ id, userId, side, amount });

const base = { betId: 'b-1', betTitle: 'Chiefs cover', winningSide: 'A', sideNames: { A: 'Chiefs', B: 'Bills' }, proUserIds: new Set<string>() };

describe('planSettlement', () => {
  it('splits the pot between winners in proportion to their stakes', () => {
    const plan = planSettlement({ ...base, participants: [p('1', 'A', 10), p('2', 'A', 30), p('3', 'B', 40)] });
    // Pot 80; winners staked 10 and 30
    expect(plan.payouts.map((x) => x.gross)).toEqual([20, 60]);
    expect(plan.payouts.reduce((s, x) => s + x.gross, 0)).toBe(80);
  });

  it('takes the fee from free members and waives it for Pro', () => {
    const plan = planSettlement({
      ...base,
      participants: [p('1', 'A', 10, 'free'), p('2', 'A', 10, 'pro'), p('3', 'B', 20)],
      proUserIds: new Set(['pro']),
    });
    const free = plan.payouts.find((x) => x.userId === 'free')!;
    const pro = plan.payouts.find((x) => x.userId === 'pro')!;
    expect(free.fee).toBe(20 * WINNINGS_FEE_RATE);
    expect(free.net).toBe(20 - 20 * WINNINGS_FEE_RATE);
    expect(pro).toMatchObject({ gross: 20, fee: 0, net: 20 });
  });

  it('records the fee actually charged, so the ledger never shows a fee a Pro member did not pay', () => {
    const plan = planSettlement({ ...base, participants: [p('1', 'A', 10, 'pro'), p('2', 'B', 10)], proUserIds: new Set(['pro']) });
    expect(plan.entries[0]).toMatchObject({ platformFee: 0, amount: 20, actualAmount: 20, delta: 20 });
  });

  it('credits the net amount under a deterministic id, completing the pending row', () => {
    const plan = planSettlement({ ...base, participants: [p('1', 'A', 10), p('2', 'B', 10)] });
    expect(plan.entries).toEqual([
      expect.objectContaining({
        transactionId: 'payout#1',
        userId: 'u-1',
        type: 'BET_WON',
        mode: 'upsertPending',
        status: 'COMPLETED',
        relatedBetId: 'b-1',
        relatedParticipantId: '1',
        notes: 'Chiefs cover - Chiefs won',
      }),
    ]);
  });

  it('uses the stakes, not the bet totalPot (which clients can write)', () => {
    // No totalPot input at all: the pot is the sum of stakes
    const plan = planSettlement({ ...base, participants: [p('1', 'A', 5), p('2', 'B', 7)] });
    expect(plan.payouts[0].gross).toBe(12);
  });

  it('pays exactly the pot when shares do not divide evenly', () => {
    const plan = planSettlement({ ...base, participants: [p('1', 'A', 1), p('2', 'A', 1), p('3', 'A', 1), p('4', 'B', 10)] });
    const grosses = plan.payouts.map((x) => x.gross);
    expect(grosses).toEqual([4.33, 4.33, 4.34]);
    expect(Math.round(grosses.reduce((s, x) => s + x, 0) * 100)).toBe(1300);
  });

  it('returns every stake when nobody backed the winning side', () => {
    const plan = planSettlement({ ...base, participants: [p('1', 'B', 10), p('2', 'B', 15)] });
    expect(plan.refundedNoWinners).toBe(true);
    expect(plan.entries.map((e) => [e.transactionId, e.type, e.delta])).toEqual([
      ['refund#1', 'BET_CANCELLED', 10],
      ['refund#2', 'BET_CANCELLED', 15],
    ]);
  });

  it('pays nothing and refunds nothing for a bet with no stakes', () => {
    const plan = planSettlement({ ...base, participants: [] });
    expect(plan.entries).toEqual([]);
  });
});

describe('overturnedByDispute', () => {
  const resolvedAt = '2026-10-01T12:00:00.000Z';
  const windowEnds = '2026-10-03T12:00:00.000Z'; // resolution + 48h

  it('blocks payout of a resolution a dispute upheld afterwards', () => {
    expect(overturnedByDispute([{ status: 'RESOLVED_FOR_FILER', resolvedAt: '2026-10-02T09:00:00.000Z' }], { disputeWindowEndsAt: windowEnds })).toBe(true);
  });

  it('allows payout once the creator has resolved again (a new window)', () => {
    const reResolvedWindow = '2026-10-04T15:00:00.000Z'; // re-resolved 2026-10-02T15:00
    expect(overturnedByDispute([{ status: 'RESOLVED_FOR_FILER', resolvedAt: '2026-10-02T09:00:00.000Z' }], { disputeWindowEndsAt: reResolvedWindow })).toBe(false);
  });

  it('ignores disputes that were dismissed or found for the creator', () => {
    expect(overturnedByDispute([{ status: 'DISMISSED', resolvedAt: '2026-10-02T09:00:00.000Z' }, { status: 'RESOLVED_FOR_CREATOR', resolvedAt: resolvedAt }], { disputeWindowEndsAt: windowEnds })).toBe(false);
  });

  it('does not pay when it cannot tell when the bet was resolved', () => {
    expect(overturnedByDispute([{ status: 'RESOLVED_FOR_FILER', resolvedAt: '2026-10-02T09:00:00.000Z' }], { disputeWindowEndsAt: null })).toBe(true);
    expect(overturnedByDispute([{ status: 'RESOLVED_FOR_FILER', resolvedAt: null }], { disputeWindowEndsAt: windowEnds })).toBe(true);
  });

  it('uses the recorded resolution time when there is one, not the window', () => {
    const upheld = [{ status: 'RESOLVED_FOR_FILER', resolvedAt: '2026-10-02T09:00:00.000Z' }];
    // Re-resolved after the dispute, then the window was closed early (moved to now):
    // inferring from the window would put the resolution 48h back, before the dispute
    expect(overturnedByDispute(upheld, { resolvedAt: '2026-10-02T15:00:00.000Z', disputeWindowEndsAt: '2026-10-02T16:00:00.000Z' })).toBe(false);
    // Resolved before the dispute was upheld: overturned, whatever the window says
    expect(overturnedByDispute(upheld, { resolvedAt: '2026-10-01T12:00:00.000Z', disputeWindowEndsAt: '2026-10-09T00:00:00.000Z' })).toBe(true);
  });

  it('has nothing to say with no disputes', () => {
    expect(overturnedByDispute([], { disputeWindowEndsAt: windowEnds })).toBe(false);
  });
});

describe('hasOpenDispute', () => {
  it('is true for pending or under-review disputes only', () => {
    expect(hasOpenDispute([{ status: 'PENDING' }])).toBe(true);
    expect(hasOpenDispute([{ status: 'UNDER_REVIEW' }])).toBe(true);
    expect(hasOpenDispute([{ status: 'DISMISSED' }, { status: 'RESOLVED_FOR_FILER' }])).toBe(false);
  });
});
