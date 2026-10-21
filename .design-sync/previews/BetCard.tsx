import React from 'react';
import { BetCard, SideBetProvider, View } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const base = {
  id: 'bet-1',
  title: 'Lakers beat the Celtics tonight',
  description: 'Regular season game at Crypto.com Arena. Final score, overtime counts.',
  category: 'SPORTS' as const,
  status: 'ACTIVE' as const,
  creatorId: 'user-sam',
  creatorName: 'Sam Rivera',
  totalPot: 80,
  betAmount: 20,
  odds: { sideAName: 'Lakers', sideBName: 'Celtics' },
  deadline: hours(3),
  sideACount: 2,
  sideBCount: 2,
  participantUserIds: ['user-sam', 'user-ava', 'user-li', 'user-noah'],
  createdAt: hours(-5),
  updatedAt: hours(-1),
};

const pad = { padding: 16, width: 380 };

export const Joinable = () => (
  <View style={pad}><BetCard bet={base} onJoinBet={() => {}} /></View>
);

export const Joined = () => (
  <SideBetProvider myParticipation={{ 'bet-2': { side: 'A', amount: 20 } }}>
    <View style={pad}>
      <BetCard
        bet={{ ...base, id: 'bet-2', totalPot: 100, sideACount: 3, participantUserIds: [...base.participantUserIds, 'user-jordan'] }}
        onInviteFriends={() => {}}
      />
    </View>
  </SideBetProvider>
);

export const CreatedByYou = () => (
  <View style={pad}>
    <BetCard
      bet={{ ...base, id: 'bet-3', creatorId: 'user-jordan', creatorName: 'Jordan Miles',
        title: 'Will it snow in Denver before Friday?', category: 'WEATHER',
        description: 'Measurable snowfall at DIA per the NWS daily report.',
        odds: { sideAName: 'Snow', sideBName: 'No snow' }, totalPot: 30, betAmount: 10,
        sideACount: 1, sideBCount: 2 }}
      onInviteFriends={() => {}}
      onEndBet={() => {}}
    />
  </View>
);

export const PendingResolution = () => (
  <View style={pad}>
    <BetCard bet={{ ...base, id: 'bet-4', status: 'PENDING_RESOLUTION', deadline: hours(-2) }} />
  </View>
);

export const Resolved = () => (
  <SideBetProvider myParticipation={{ 'bet-5': { side: 'A', amount: 20 } }}>
    <View style={pad}>
      <BetCard
        bet={{ ...base, id: 'bet-5', status: 'RESOLVED', winningSide: 'A', deadline: hours(-20),
          participantUserIds: [...base.participantUserIds, 'user-jordan'] }}
      />
    </View>
  </SideBetProvider>
);

