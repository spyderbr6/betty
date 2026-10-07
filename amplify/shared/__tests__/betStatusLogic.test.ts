import { describe, expect, it } from 'vitest';
import { checkEndEarly, checkFileDispute, planDisputeBet, planEndEarly } from '../betStatusLogic';

const now = '2026-10-06T12:00:00.000Z';
const active = { id: 'b1', status: 'ACTIVE', creatorId: 'creator', participantUserIds: ['creator', 'p1'] };
const awaiting = {
  ...active,
  status: 'PENDING_RESOLUTION',
  winningSide: 'A',
  disputeWindowEndsAt: '2026-10-07T12:00:00.000Z',
};
const filing = (over: Partial<Parameters<typeof checkFileDispute>[0]> = {}) =>
  checkFileDispute({ bet: awaiting, userId: 'p1', reason: 'INCORRECT_RESOLUTION', description: 'Wrong side', disputes: [], now, ...over });

describe('ending a bet early', () => {
  it('only its creator, only while ACTIVE', () => {
    expect(checkEndEarly(active, 'creator')).toBeNull();
    expect(checkEndEarly(active, 'p1')).toBe('NOT_CREATOR');
    expect(checkEndEarly({ ...active, status: 'PENDING_RESOLUTION' }, 'creator')).toBe('NOT_ACTIVE');
    expect(checkEndEarly(null, 'creator')).toBe('NOT_FOUND');
  });

  it('writes the new status only if the bet is still ACTIVE', () => {
    expect(planEndEarly('b1')).toEqual([
      { table: 'Bet', id: 'b1', set: { status: 'PENDING_RESOLUTION' }, expect: { status: 'ACTIVE' } },
    ]);
  });
});

describe('filing a dispute', () => {
  it('a participant may dispute a result awaiting payout', () => {
    expect(filing()).toBeNull();
  });

  it('not the creator, and not someone outside the bet', () => {
    expect(filing({ userId: 'creator' })).toBe('IS_CREATOR');
    expect(filing({ userId: 'stranger' })).toBe('NOT_PARTICIPANT');
  });

  it('only a result that has not been paid', () => {
    expect(filing({ bet: { ...awaiting, winningSide: null } })).toBe('NOT_RESOLVED');
    expect(filing({ bet: { ...awaiting, status: 'RESOLVED' } })).toBe('NOT_RESOLVED');
    expect(filing({ bet: active })).toBe('NOT_RESOLVED');
  });

  it('only while the dispute window is open', () => {
    expect(filing({ now: '2026-10-07T12:00:00.000Z' })).toBe('WINDOW_CLOSED');
  });

  it('not while another dispute is open', () => {
    expect(filing({ disputes: [{ status: 'PENDING' }] })).toBe('ALREADY_DISPUTED');
    expect(filing({ disputes: [{ status: 'DISMISSED' }] })).toBeNull();
  });

  it('refuses an unknown reason or an empty or oversized description', () => {
    expect(filing({ reason: 'BORED' })).toBe('INVALID');
    expect(filing({ description: '   ' })).toBe('INVALID');
    expect(filing({ description: 'x'.repeat(2001) })).toBe('INVALID');
  });

  it('marks the bet DISPUTED only if it still awaits payout with the same winner', () => {
    expect(planDisputeBet(awaiting)).toEqual([
      { table: 'Bet', id: 'b1', set: { status: 'DISPUTED' }, expect: { status: 'PENDING_RESOLUTION', winningSide: 'A' } },
    ]);
  });
});
