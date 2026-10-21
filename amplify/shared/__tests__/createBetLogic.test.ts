import { describe, expect, it } from 'vitest';
import { invalidField, LIMITS, planCreateBet, type CreateBetArgs } from '../createBetLogic';

const NOW = '2026-10-04T12:00:00.000Z';
const BET_ID = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

const args = (over: Partial<CreateBetArgs> = {}): CreateBetArgs => ({
  betId: BET_ID,
  title: '  Chiefs win  ',
  description: 'Sunday',
  category: 'SPORTS',
  amount: 25,
  side: 'A',
  sideAName: 'Chiefs',
  sideBName: 'Bills',
  deadlineMinutes: 30,
  isPrivate: false,
  ...over,
});

describe('invalidField', () => {
  it('accepts what the form sends', () => {
    expect(invalidField(args())).toBeNull();
    expect(invalidField(args({ amount: 2.5, eventId: 'event-1', isPrivate: true }))).toBeNull();
  });

  it('needs a well-formed bet id, so a retried tap maps to the same bet', () => {
    expect(invalidField(args({ betId: 'bet-1' }))).toBe('betId');
  });

  it('enforces the form\'s text limits on the server too', () => {
    expect(invalidField(args({ title: '   ' }))).toBe('title');
    expect(invalidField(args({ title: 'x'.repeat(LIMITS.title + 1) }))).toBe('title');
    expect(invalidField(args({ description: '' }))).toBe('description');
    expect(invalidField(args({ sideBName: ' ' }))).toBe('sideBName');
  });

  it('refuses stakes that are not a positive amount in cents', () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1.005]) {
      expect(invalidField(args({ amount }))).toBe('amount');
    }
  });

  it('refuses an unknown side or category', () => {
    expect(invalidField(args({ side: 'C' }))).toBe('side');
    expect(invalidField(args({ category: 'POKER' }))).toBe('category');
  });

  it('accepts a pool of three to six distinct options, and a side among them', () => {
    const options = ['Chiefs', 'Bills', 'Eagles'];
    expect(invalidField(args({ options, side: 'C' }))).toBeNull();
    expect(invalidField(args({ options, side: 'D' }))).toBe('side');
    expect(invalidField(args({ options: ['Chiefs', 'Bills'] }))).toBe('options');
    expect(invalidField(args({ options: ['1', '2', '3', '4', '5', '6', '7'] }))).toBe('options');
    expect(invalidField(args({ options: ['Chiefs', 'Bills', ' '] }))).toBe('options');
    expect(invalidField(args({ options: ['Chiefs', 'Bills', ' chiefs'] }))).toBe('options');
    expect(invalidField(args({ options: 'Chiefs' as unknown as string[] }))).toBe('options');
    expect(invalidField(args({ options: null }))).toBeNull();
  });

  it('caps a bet at two people only, and never a pool', () => {
    expect(invalidField(args({ maxParticipants: 2 }))).toBeNull();
    expect(invalidField(args({ maxParticipants: 3 }))).toBe('maxParticipants');
    expect(invalidField(args({ maxParticipants: 2, options: ['Chiefs', 'Bills', 'Eagles'] }))).toBe('maxParticipants');
  });

  it('needs a deadline of whole minutes, at least one and at most a year out', () => {
    expect(invalidField(args({ deadlineMinutes: 0 }))).toBe('deadlineMinutes');
    expect(invalidField(args({ deadlineMinutes: 1.5 }))).toBe('deadlineMinutes');
    expect(invalidField(args({ deadlineMinutes: LIMITS.deadlineMinutes + 1 }))).toBe('deadlineMinutes');
    expect(invalidField(args({ deadlineMinutes: LIMITS.deadlineMinutes }))).toBeNull();
  });
});

describe('planCreateBet', () => {
  const plan = planCreateBet({ args: args(), userId: 'u-1', creatorName: 'Pat', now: NOW });
  const bet = plan.stateUpdates.find((u) => u.table === 'Bet');
  const participant = plan.stateUpdates.find((u) => u.table === 'Participant');

  it('creates the bet only if its id is free, ACTIVE, with the creator counted', () => {
    expect(bet).toMatchObject({
      id: BET_ID,
      create: { typename: 'Bet' },
      set: {
        title: 'Chiefs win',
        status: 'ACTIVE',
        creatorId: 'u-1',
        creatorName: 'Pat',
        totalPot: 25,
        betAmount: 25,
        sideACount: 1,
        sideBCount: 0,
        participantUserIds: ['u-1'],
        isPrivate: false,
        deadline: '2026-10-04T12:30:00.000Z',
      },
    });
  });

  it('stores odds as an object, as AppSync does', () => {
    expect(bet?.set.odds).toEqual({ sideAName: 'Chiefs', sideBName: 'Bills' });
  });

  it('writes the creator\'s participant row and debits the stake in the same write', () => {
    expect(participant).toMatchObject({
      id: `${BET_ID}#u-1`,
      create: { typename: 'Participant' },
      set: { betId: BET_ID, userId: 'u-1', side: 'A', amount: 25, status: 'ACCEPTED', joinedAt: NOW },
    });
    expect(plan.entries).toEqual([
      expect.objectContaining({
        transactionId: `stake#${BET_ID}#u-1`,
        userId: 'u-1',
        type: 'BET_PLACED',
        delta: -25,
        amount: 25,
        mode: 'create',
        relatedBetId: BET_ID,
      }),
    ]);
  });

  it('leaves a two-sided bet without pool counts or a cap', () => {
    expect(bet?.set).not.toHaveProperty('sideCCount');
    expect(bet?.set).not.toHaveProperty('maxParticipants');
  });

  it('writes a pool\'s options and one count each, with the creator on their pick', () => {
    const pool = planCreateBet({
      args: args({ options: [' Chiefs ', 'Bills', 'Eagles'], side: 'C', sideAName: 'ignored', sideBName: 'ignored' }),
      userId: 'u-1',
      creatorName: 'Pat',
      now: NOW,
    });
    const set = pool.stateUpdates[0].set;
    expect(set.odds).toEqual({ sideAName: 'Chiefs', sideBName: 'Bills', options: ['Chiefs', 'Bills', 'Eagles'] });
    expect(set).toMatchObject({ sideACount: 0, sideBCount: 0, sideCCount: 1 });
    expect(set).not.toHaveProperty('sideDCount');
    expect(pool.stateUpdates[1].set.side).toBe('C');
    expect(pool.entries[0].notes).toBe('Chiefs win - You bet on Eagles');
  });

  it('records the cap of a head-to-head bet', () => {
    const duel = planCreateBet({ args: args({ maxParticipants: 2, side: 'B' }), userId: 'u-1', creatorName: 'Pat', now: NOW });
    expect(duel.stateUpdates[0].set).toMatchObject({ maxParticipants: 2, sideACount: 0, sideBCount: 1 });
  });

  it('records the event only when there is one', () => {
    expect(bet?.set).not.toHaveProperty('eventId');
    const withEvent = planCreateBet({ args: args({ eventId: 'event-1' }), userId: 'u-1', creatorName: 'Pat', now: NOW });
    expect(withEvent.stateUpdates[0].set.eventId).toBe('event-1');
  });
});
