import { describe, expect, it } from 'vitest';
import { checkJoin, participantIdFor, planJoin, stakeTransactionId, type JoinRequest } from '../joinLogic';

const NOW = '2026-10-04T12:00:00.000Z';
const LATER = '2026-10-05T12:00:00.000Z';

const request = (over: Partial<JoinRequest> = {}, bet: Partial<NonNullable<JoinRequest['bet']>> = {}): JoinRequest => ({
  bet: { id: 'bet-1', status: 'ACTIVE', deadline: LATER, betAmount: 25, isPrivate: false, title: 'Chiefs win', ...bet },
  userId: 'u-1',
  side: 'A',
  amount: 25,
  now: NOW,
  alreadyJoined: false,
  invited: false,
  takenSides: ['A'],
  ...over,
});
const POOL = { sideAName: 'Chiefs', sideBName: 'Bills', options: ['Chiefs', 'Bills', 'Eagles'] };

describe('checkJoin', () => {
  it('allows an open public bet before its deadline', () => {
    expect(checkJoin(request())).toBeNull();
  });

  it('refuses a missing bet, a bet no longer open, or one past its deadline', () => {
    expect(checkJoin(request({ bet: null }))).toBe('NOT_FOUND');
    expect(checkJoin(request({}, { status: 'PENDING_RESOLUTION' }))).toBe('NOT_OPEN');
    expect(checkJoin(request({}, { deadline: NOW }))).toBe('EXPIRED');
    expect(checkJoin(request({}, { deadline: null }))).toBe('EXPIRED');
  });

  it('refuses a side that is not A or B', () => {
    expect(checkJoin(request({ side: 'C' }))).toBe('INVALID_SIDE');
  });

  it('accepts any of a pool\'s options, and nothing past them', () => {
    expect(checkJoin(request({ side: 'C' }, { odds: POOL }))).toBeNull();
    expect(checkJoin(request({ side: 'A' }, { odds: POOL }))).toBeNull();
    expect(checkJoin(request({ side: 'D' }, { odds: POOL }))).toBe('INVALID_SIDE');
  });

  it('lets one opponent into a head-to-head bet, on the open side', () => {
    const duel = { maxParticipants: 2 };
    expect(checkJoin(request({ side: 'B' }, duel))).toBeNull();
    expect(checkJoin(request({ side: 'A' }, duel))).toBe('SIDE_TAKEN');
    expect(checkJoin(request({ side: 'B', takenSides: ['A', 'B'] }, duel))).toBe('FULL');
    // No cap: any number may share a side
    expect(checkJoin(request({ side: 'A', takenSides: ['A', 'A', 'B'] }))).toBeNull();
  });

  it('charges the bet\'s stake only, and refuses if the app showed another', () => {
    expect(checkJoin(request({}, { betAmount: null }))).toBe('NO_STAKE');
    expect(checkJoin(request({ amount: 10 }))).toBe('AMOUNT_CHANGED');
    expect(checkJoin(request({ amount: 25.0000001 }))).toBeNull();
  });

  it('refuses a second join', () => {
    expect(checkJoin(request({ alreadyJoined: true }))).toBe('ALREADY_JOINED');
  });

  it('requires an invitation for a private bet', () => {
    expect(checkJoin(request({}, { isPrivate: true }))).toBe('NOT_INVITED');
    expect(checkJoin(request({ invited: true }, { isPrivate: true }))).toBeNull();
  });
});

describe('planJoin', () => {
  const plan = planJoin({
    bet: { id: 'bet-1', status: 'ACTIVE', deadline: LATER, betAmount: 25, title: 'Chiefs win' },
    userId: 'u-1',
    side: 'B',
    sideName: 'Bills',
    now: NOW,
  });

  it('debits the stake under a fixed id per bet and user', () => {
    expect(plan.participantId).toBe(participantIdFor('bet-1', 'u-1'));
    expect(plan.entries).toEqual([
      expect.objectContaining({
        transactionId: stakeTransactionId('bet-1#u-1'),
        userId: 'u-1',
        type: 'BET_PLACED',
        delta: -25,
        amount: 25,
        mode: 'create',
        relatedBetId: 'bet-1',
        relatedParticipantId: 'bet-1#u-1',
      }),
    ]);
  });

  it('creates the participant row in the same write, with joinedAt for the index', () => {
    const participant = plan.stateUpdates.find((u) => u.table === 'Participant');
    expect(participant).toMatchObject({
      id: 'bet-1#u-1',
      create: { typename: 'Participant' },
      set: { betId: 'bet-1', userId: 'u-1', side: 'B', amount: 25, status: 'ACCEPTED', joinedAt: NOW },
    });
  });

  it('counts the join on the bet only while it is open and before its deadline', () => {
    const bet = plan.stateUpdates.find((u) => u.table === 'Bet');
    expect(bet).toMatchObject({
      id: 'bet-1',
      add: { totalPot: 25, sideBCount: 1 },
      append: { participantUserIds: ['u-1'] },
      expect: { status: 'ACTIVE' },
      expectAfter: { deadline: NOW },
    });
    expect(bet?.add).not.toHaveProperty('sideACount');
  });

  it('counts a pool join on the option picked', () => {
    const pool = planJoin({
      bet: { id: 'bet-1', status: 'ACTIVE', deadline: LATER, betAmount: 25, title: 'Winner', odds: POOL },
      userId: 'u-1',
      side: 'C',
      sideName: 'Eagles',
      now: NOW,
    });
    expect(pool.stateUpdates.find((u) => u.table === 'Bet')).toMatchObject({
      add: { totalPot: 25, sideCCount: 1 },
      expect: { status: 'ACTIVE' },
    });
    expect(pool.stateUpdates.find((u) => u.table === 'Participant')?.set.side).toBe('C');
  });

  it('lets a head-to-head join through only while nobody holds the side', () => {
    const duel = planJoin({
      bet: { id: 'bet-1', status: 'ACTIVE', deadline: LATER, betAmount: 25, title: 'Golf', maxParticipants: 2 },
      userId: 'u-1',
      side: 'B',
      sideName: 'Sam',
      now: NOW,
    });
    expect(duel.stateUpdates.find((u) => u.table === 'Bet')?.expect).toEqual({ status: 'ACTIVE', sideBCount: 0 });
  });
});
