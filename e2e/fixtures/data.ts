import { list, one } from './appsync';
import { TEST_USER } from './session';

/**
 * Shared record shapes and the default handler set.
 *
 * Shapes follow what the app's transforms actually read, which is not always the
 * schema in CLAUDE.md — see the note on `bet` below.
 */

export const OTHER_USER = {
  id: 'other-user-0000-0000-000000000002',
  email: 'friend@example.com',
  displayName: 'Casey Friend',
};

export const profile = (over: Record<string, unknown> = {}) => ({
  id: TEST_USER.userId,
  email: TEST_USER.email,
  displayName: TEST_USER.displayName,
  role: 'USER',
  balance: 250,
  trustScore: 100,
  totalBets: 0,
  totalWinnings: 0,
  winRate: 0,
  ...over,
});

/**
 * transformAmplifyBet drops any record without `category`, reads side names out
 * of the `odds` JSON blob, and uses `deadline` rather than `expiresAt`.
 */
export const bet = (over: Record<string, unknown> = {}) => ({
  id: 'bet-1',
  title: 'Chiefs cover the spread',
  description: 'Sunday night',
  category: 'SPORTS',
  betAmount: 25,
  odds: JSON.stringify({ sideAName: 'Chiefs', sideBName: 'Bills' }),
  status: 'ACTIVE',
  creatorId: TEST_USER.userId,
  creatorName: TEST_USER.displayName,
  isPrivate: false,
  sideACount: 1,
  sideBCount: 0,
  participantUserIds: [TEST_USER.userId],
  totalPot: 25,
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

/** A bet somebody else owns, which the current user has not joined. */
export const joinableBet = (over: Record<string, unknown> = {}) =>
  bet({
    id: 'bet-open',
    title: 'Lakers win outright',
    creatorId: OTHER_USER.id,
    creatorName: OTHER_USER.displayName,
    sideACount: 0,
    sideBCount: 0,
    participantUserIds: [],
    totalPot: 0,
    ...over,
  });

export const betInvitation = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  betId: 'bet-open',
  fromUserId: OTHER_USER.id,
  toUserId: TEST_USER.userId,
  status: 'PENDING',
  invitedSide: '',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: new Date().toISOString(),
  ...over,
});

/**
 * Every operation the shell fires on boot, answered empty unless overridden.
 *
 * `getUser` is keyed on the requested id: the invitation flow looks up the
 * sender as well as the signed-in user, and returning the same profile for both
 * makes an invitation appear to come from yourself.
 */
export const baseHandlers = (
  over: Record<string, (variables: Record<string, unknown>) => unknown> = {},
  me: Record<string, unknown> = {}
) => ({
  getUser: (variables: Record<string, unknown>) =>
    variables.id === OTHER_USER.id ? OTHER_USER : profile(me),
  listUsers: list(),
  betsByStatus: list(),
  listBets: list(),
  getBet: one(null),
  listParticipants: list(),
  squaresGamesByStatus: list(),
  listSquaresGames: list(),
  listSquaresPurchases: list(),
  listSquaresInvitations: list(),
  listBetInvitations: list(),
  listFriendships: list(),
  listFriendRequests: list(),
  notificationsByUser: list(),
  listEventCheckIns: list(),
  activeEventsByTime: list(),
  ...over,
});
