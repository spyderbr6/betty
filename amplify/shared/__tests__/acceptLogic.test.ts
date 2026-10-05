import { describe, expect, it } from 'vitest';
import { checkAccept, EARLY_CLOSE_LEAD_MS, planAccept } from '../acceptLogic';

const NOW = '2026-10-05T12:00:00.000Z';
const LATER = '2026-10-07T12:00:00.000Z';
const bet = (over: Record<string, unknown> = {}) => ({
  id: 'bet-1',
  creatorId: 'creator',
  status: 'PENDING_RESOLUTION',
  winningSide: 'A',
  disputeWindowEndsAt: LATER,
  ...over,
});
const participants = [
  { id: 'p-creator', userId: 'creator', hasAcceptedResult: false },
  { id: 'p-b', userId: 'b', hasAcceptedResult: false },
  { id: 'p-c', userId: 'c', hasAcceptedResult: false },
];

describe('checkAccept', () => {
  it('lets a participant accept a resolved result', () => {
    expect(checkAccept(bet(), 'b', participants)).toBeNull();
  });

  it('refuses the creator, outsiders, and bets without a result to accept', () => {
    expect(checkAccept(bet(), 'creator', participants)).toBe('IS_CREATOR');
    expect(checkAccept(bet(), 'stranger', participants)).toBe('NOT_PARTICIPANT');
    expect(checkAccept(bet({ winningSide: null }), 'b', participants)).toBe('NOT_AWAITING');
    expect(checkAccept(bet({ status: 'RESOLVED' }), 'b', participants)).toBe('NOT_AWAITING');
    expect(checkAccept(null, 'b', participants)).toBe('NOT_FOUND');
  });
});

describe('planAccept', () => {
  it('records the acceptance and leaves the window while others have not accepted', () => {
    const plan = planAccept({ bet: bet(), userId: 'b', participants, now: NOW });
    expect(plan).toMatchObject({ closesEarly: false, accepted: 1, total: 2 });
    expect(plan.stateUpdates).toEqual([
      { table: 'Participant', id: 'p-b', set: { hasAcceptedResult: true, acceptedResultAt: NOW } },
    ]);
  });

  it('closes the window when the last participant accepts, only for the same result', () => {
    const others = participants.map((p) => (p.userId === 'c' ? { ...p, hasAcceptedResult: true } : p));
    const plan = planAccept({ bet: bet(), userId: 'b', participants: others, now: NOW });
    expect(plan).toMatchObject({ closesEarly: true, accepted: 2, total: 2 });
    expect(plan.stateUpdates[1]).toEqual({
      table: 'Bet',
      id: 'bet-1',
      set: { disputeWindowEndsAt: new Date(new Date(NOW).getTime() - EARLY_CLOSE_LEAD_MS).toISOString() },
      expect: { status: 'PENDING_RESOLUTION', winningSide: 'A' },
    });
  });

  it('does not count the creator, who never accepts', () => {
    const plan = planAccept({ bet: bet(), userId: 'b', participants: participants.slice(0, 2), now: NOW });
    expect(plan).toMatchObject({ closesEarly: true, accepted: 1, total: 1 });
  });

  it('accepting twice writes nothing more', () => {
    const already = participants.map((p) => (p.userId === 'b' ? { ...p, hasAcceptedResult: true } : p));
    expect(planAccept({ bet: bet(), userId: 'b', participants: already, now: NOW }).stateUpdates).toEqual([]);
  });

  it('leaves a window that has already passed as it is', () => {
    const plan = planAccept({ bet: bet({ disputeWindowEndsAt: '2026-10-05T11:00:00.000Z' }), userId: 'b', participants: participants.slice(0, 2), now: NOW });
    expect(plan.closesEarly).toBe(false);
  });
});
