import React from 'react';
import { BetList, View } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const bets = [
  {
    id: 'bl-1',
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
  },
  {
    id: 'bl-2',
    title: 'Will it snow in Denver before Friday?',
    description: 'Measurable snowfall at DIA per the NWS daily report.',
    category: 'WEATHER' as const,
    status: 'ACTIVE' as const,
    creatorId: 'user-ava',
    creatorName: 'Ava Chen',
    totalPot: 30,
    betAmount: 10,
    odds: { sideAName: 'Snow', sideBName: 'No snow' },
    deadline: hours(52),
    sideACount: 1,
    sideBCount: 2,
    participantUserIds: ['user-ava', 'user-li', 'user-noah'],
    createdAt: hours(-2),
    updatedAt: hours(-2),
  },
  {
    id: 'bl-3',
    title: 'NVDA closes above $150 Friday',
    description: 'Nasdaq closing price on Friday, per Yahoo Finance.',
    category: 'STOCKS' as const,
    status: 'PENDING_RESOLUTION' as const,
    creatorId: 'user-li',
    creatorName: 'Li Wei',
    totalPot: 150,
    betAmount: 50,
    odds: { sideAName: 'Above $150', sideBName: 'Below $150' },
    deadline: hours(-3),
    sideACount: 2,
    sideBCount: 1,
    participantUserIds: ['user-li', 'user-sam', 'user-ava'],
    createdAt: hours(-30),
    updatedAt: hours(-3),
  },
];

const frame = { width: 380, height: 680, padding: 16 };
const noop = () => {};

export const Default = () => (
  <View style={frame}>
    <BetList bets={bets.slice(0, 2)} onJoinBet={noop} />
  </View>
);

export const FilteredToActive = () => (
  <View style={frame}>
    <BetList bets={bets} onJoinBet={noop} initialFilters={{ status: ['ACTIVE'] }} />
  </View>
);

export const ListOnly = () => (
  <View style={{ ...frame, height: 600 }}>
    <BetList bets={bets.slice(0, 2)} onJoinBet={noop} showSearch={false} showFilters={false} />
  </View>
);

export const Empty = () => (
  <View style={{ ...frame, height: 320 }}>
    <BetList
      bets={[]}
      emptyTitle="No open bets"
      emptyDescription="None of your friends have an open bet right now. Start one!"
    />
  </View>
);
