import { describe, expect, it } from 'vitest';
import { participationToFetch } from '../participationLogic';

describe('participationToFetch', () => {
  const me = 'user-1';
  const bets = [
    { id: 'joined-known', participantUserIds: [me] },
    { id: 'joined-new', participantUserIds: ['other', me] },
    { id: 'not-mine', participantUserIds: ['other'] },
    { id: 'created-empty', participantUserIds: null },
    { id: 'asked-before', participantUserIds: [me] },
  ];

  it('asks only for bets the viewer is in whose pick is not known or already asked for', () => {
    expect(
      participationToFetch({
        bets,
        userId: me,
        known: new Set(['joined-known']),
        requested: new Set(['asked-before']),
      }),
    ).toEqual([{ betId: 'joined-new', participantId: 'joined-new#user-1' }]);
  });

  it('asks for nothing once every pick is known', () => {
    expect(
      participationToFetch({ bets, userId: me, known: new Set(['joined-known', 'joined-new', 'asked-before']), requested: new Set() }),
    ).toEqual([]);
  });
});
