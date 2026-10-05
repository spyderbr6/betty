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
  ...over,
});

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
});
