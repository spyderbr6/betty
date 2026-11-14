/**
 * Which bets the viewer is in but whose pick the app does not know yet.
 *
 * BetDataContext reads the viewer's participant rows once, at load. A bet joined or
 * created later (here, through an invitation, or on another device) arrives by
 * subscription with participantUserIds naming the viewer but no participant row, so its
 * card could not show which option was picked. Those rows are then read one by one, by the
 * fixed id the server gives them (participantIdFor). Free of Amplify imports so it is
 * unit tested.
 */

import { participantIdFor } from '../../amplify/shared/joinLogic';

export function participationToFetch(params: {
  bets: Array<{ id: string; participantUserIds?: string[] | null }>;
  userId: string;
  known: { has: (betId: string) => boolean };
  /** Bets already asked about, so a row that is not there is not asked for again */
  requested: { has: (betId: string) => boolean };
}): Array<{ betId: string; participantId: string }> {
  const { bets, userId, known, requested } = params;
  return bets
    .filter((bet) => (bet.participantUserIds || []).includes(userId) && !known.has(bet.id) && !requested.has(bet.id))
    .map((bet) => ({ betId: bet.id, participantId: participantIdFor(bet.id, userId) }));
}
