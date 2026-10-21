import React from 'react';
import { BetInvitationCard, View } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const sam = {
  id: 'user-sam', username: 'sam.rivera', email: 'sam.rivera@example.com', displayName: 'Sam Rivera',
  balance: 120, trustScore: 5, totalBets: 34, totalWinnings: 410, winRate: 0.56,
  createdAt: hours(-2000), updatedAt: hours(-3),
};

const bet = {
  id: 'bet-inv-1',
  title: 'Chiefs cover -3.5 vs Bills',
  description: 'Sunday night game in Kansas City. Spread from kickoff, overtime counts.',
  category: 'SPORTS' as const,
  status: 'ACTIVE' as const,
  creatorId: 'user-sam',
  creatorName: 'Sam Rivera',
  totalPot: 75,
  betAmount: 25,
  odds: { sideAName: 'Chiefs cover', sideBName: 'Bills cover' },
  deadline: hours(30),
  sideACount: 2,
  sideBCount: 1,
  participantUserIds: ['user-sam', 'user-ava', 'user-li'],
  createdAt: hours(-4),
  updatedAt: hours(-1),
};

const invitation = {
  id: 'inv-1',
  betId: bet.id,
  fromUserId: 'user-sam',
  toUserId: 'user-jordan',
  bet,
  fromUser: sam,
  status: 'PENDING' as const,
  invitedSide: 'B',
  createdAt: hours(-4),
  updatedAt: hours(-4),
  expiresAt: hours(20),
};

const pad = { padding: 16, width: 380 };
const noop = () => {};

export const InvitedToSide = () => (
  <View style={pad}>
    <BetInvitationCard invitation={invitation} onAccept={noop} onDecline={noop} isProcessing={false} />
  </View>
);

export const ChooseSide = () => (
  <View style={pad}>
    <BetInvitationCard
      invitation={{ ...invitation, id: 'inv-2', invitedSide: '', expiresAt: hours(6) }}
      onAccept={noop} onDecline={noop} isProcessing={false}
    />
  </View>
);

export const Pool = () => (
  <View style={pad}>
    <BetInvitationCard
      invitation={{
        ...invitation, id: 'inv-3', invitedSide: '', expiresAt: hours(44),
        fromUser: { ...sam, id: 'user-ava', displayName: 'Ava Chen' },
        bet: {
          ...bet, id: 'bet-inv-3', title: 'Who wins Best Picture?', category: 'ENTERTAINMENT',
          description: 'Academy Awards, announced live on Sunday. Winner takes the pot.',
          betAmount: 10, totalPot: 60,
          odds: { sideAName: 'The Brutalist', sideBName: 'Anora', options: ['The Brutalist', 'Anora', 'Conclave', 'Wicked'] },
          sideACount: 2, sideBCount: 2, sideCCount: 1, sideDCount: 1,
        },
      }}
      onAccept={noop} onDecline={noop} isProcessing={false}
    />
  </View>
);

export const HeadToHead = () => (
  <View style={pad}>
    <BetInvitationCard
      invitation={{
        ...invitation, id: 'inv-4', invitedSide: 'A', expiresAt: hours(12),
        bet: {
          ...bet, id: 'bet-inv-4', title: 'I beat you at golf Saturday', category: 'CUSTOM',
          description: '18 holes at Riverside, lowest gross score wins. No mulligans.',
          betAmount: 50, totalPot: 50, maxParticipants: 2,
          odds: { sideAName: 'Sam wins', sideBName: 'Jordan wins' },
          sideACount: 1, sideBCount: 0, participantUserIds: ['user-sam'],
        },
      }}
      onAccept={noop} onDecline={noop} isProcessing={false}
    />
  </View>
);

export const Processing = () => (
  <View style={pad}>
    <BetInvitationCard invitation={invitation} onAccept={noop} onDecline={noop} isProcessing />
  </View>
);
