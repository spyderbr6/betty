import React from 'react';
import { PendingInvitations, SideBetProvider, View } from 'sidebet-ui';

// Reads betInvitations from BetDataContext; SideBetProvider supplies them.
// (Squares invitations are not yet overridable through SideBetProvider.)

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const person = (id: string, displayName: string) => ({
  id, username: displayName.toLowerCase().replace(' ', '.'), email: `${id}@example.com`, displayName,
  balance: 100, trustScore: 5, totalBets: 20, totalWinnings: 180, winRate: 0.5,
  createdAt: hours(-2000), updatedAt: hours(-5),
});

const bet = (id: string, extra: Record<string, unknown>) => ({
  id,
  category: 'SPORTS' as const,
  status: 'ACTIVE' as const,
  creatorId: 'user-sam',
  totalPot: 60,
  betAmount: 20,
  deadline: hours(30),
  sideACount: 2,
  sideBCount: 1,
  participantUserIds: ['user-sam', 'user-ava', 'user-li'],
  createdAt: hours(-4),
  updatedAt: hours(-1),
  ...extra,
}) as any;

const invite = (id: string, from: ReturnType<typeof person>, b: any, invitedSide: string, expiresIn: number) => ({
  id, betId: b.id, fromUserId: from.id, toUserId: 'user-jordan', bet: b, fromUser: from,
  status: 'PENDING' as const, invitedSide, createdAt: hours(-3), updatedAt: hours(-3), expiresAt: hours(expiresIn),
});

const invitations = [
  invite('pi-1', person('user-sam', 'Sam Rivera'), bet('pb-1', {
    title: 'Chiefs cover -3.5 vs Bills',
    description: 'Sunday night game in Kansas City. Spread from kickoff, overtime counts.',
    odds: { sideAName: 'Chiefs cover', sideBName: 'Bills cover' },
  }), 'B', 20),
  invite('pi-2', person('user-ava', 'Ava Chen'), bet('pb-2', {
    title: 'Over/under 8.5 runs at Fenway',
    description: 'Yankees at Red Sox, total runs after nine innings.',
    category: 'SPORTS', betAmount: 10, totalPot: 40, sideACount: 2, sideBCount: 2,
    odds: { sideAName: 'Over 8.5', sideBName: 'Under 8.5' },
  }), '', 5),
];

const pad = { padding: 16, width: 380 };
const noop = () => {};

export const OneInvitation = () => (
  <SideBetProvider betInvitations={invitations.slice(0, 1)}>
    <View style={pad}><PendingInvitations onSquaresPress={noop} /></View>
  </SideBetProvider>
);

export const SeveralInvitations = () => (
  <SideBetProvider betInvitations={invitations}>
    <View style={pad}><PendingInvitations onSquaresPress={noop} /></View>
  </SideBetProvider>
);

const squaresInvitations = [
  {
    id: 'sq-inv-1', squaresGameId: 'sq-1', fromUserId: 'user-li', toUserId: 'user-jordan',
    status: 'PENDING' as const, createdAt: hours(-2), updatedAt: hours(-2), expiresAt: hours(46),
    fromUser: person('user-li', 'Li Wei'),
    squaresGame: { id: 'sq-1', title: 'Super Bowl LXI squares', pricePerSquare: 5, status: 'ACTIVE' },
  },
];

export const WithSquares = () => (
  <SideBetProvider betInvitations={invitations.slice(0, 1)} squaresInvitations={squaresInvitations}>
    <View style={pad}><PendingInvitations onSquaresPress={noop} /></View>
  </SideBetProvider>
);
