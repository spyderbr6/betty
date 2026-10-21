import React from 'react';
import { LiveBetCard, View } from 'sidebet-ui';

const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const participant = (n: number, side: string, amount: number) => ({
  id: `p-${n}`, betId: 'live-1', userId: `user-${n}`, side, amount,
  status: 'ACCEPTED' as const, payout: 0, joinedAt: minutes(-30 + n),
});

const base = {
  id: 'live-1',
  title: 'Next touchdown: Eagles or Cowboys?',
  description: 'Any offensive or defensive score in the 3rd quarter at the Linc.',
  category: 'SPORTS' as const,
  status: 'LIVE' as const,
  creatorId: 'user-sam',
  creatorName: 'Sam Rivera',
  totalPot: 0,
  betAmount: 15,
  odds: { sideAName: 'Eagles', sideBName: 'Cowboys' },
  deadline: minutes(12),
  sideACount: 3,
  sideBCount: 2,
  participantUserIds: ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'],
  participants: [
    participant(1, 'A', 15), participant(2, 'A', 15), participant(3, 'A', 15),
    participant(4, 'B', 15), participant(5, 'B', 15),
  ],
  createdAt: minutes(-40),
  updatedAt: minutes(-2),
};

const pad = { paddingVertical: 16, width: 380 };
const noop = () => {};

export const Default = () => (
  <View style={pad}>
    <LiveBetCard bet={base} onPress={noop} onQuickBet={noop} />
  </View>
);

export const WithoutQuickBet = () => (
  <View style={pad}>
    <LiveBetCard
      bet={{ ...base, id: 'live-2', title: 'Ohtani homers before the 7th inning',
        description: 'Dodgers at Padres, any home run by Shohei Ohtani.',
        odds: { sideAName: 'Homer', sideBName: 'No homer' } }}
      onPress={noop}
      showQuickBet={false}
    />
  </View>
);

export const LongSideNames = () => (
  <View style={pad}>
    <LiveBetCard
      bet={{ ...base, id: 'live-3', title: 'Who scores first in the second half?',
        description: 'Arsenal vs Manchester City, Premier League at the Emirates.',
        odds: { sideAName: 'Arsenal (any player)', sideBName: 'Manchester City (any player)' },
        participants: base.participants.slice(0, 2), totalPot: 0 }}
      onQuickBet={noop}
    />
  </View>
);
