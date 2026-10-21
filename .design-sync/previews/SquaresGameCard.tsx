import React from 'react';
import { SquaresGameCard, View } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const game = {
  id: 'sq-1',
  title: 'Sunday Night Football Squares',
  description: 'Quarters pay 20/20/20/40. Numbers drawn at kickoff.',
  status: 'ACTIVE',
  pricePerSquare: 5,
  squaresSold: 62,
  totalPot: 310,
};

const event = {
  awayTeamCode: 'BUF', awayTeam: 'Buffalo Bills',
  homeTeamCode: 'KC', homeTeam: 'Kansas City Chiefs',
  scheduledTime: hours(26),
};

const pad = { padding: 16, width: 380 };
const noop = () => {};

export const Open = () => (
  <View style={pad}><SquaresGameCard squaresGame={game} event={event} onPress={noop} /></View>
);

export const InPlay = () => (
  <View style={pad}>
    <SquaresGameCard
      squaresGame={{ ...game, id: 'sq-2', status: 'LIVE', title: 'Lakers vs Celtics Squares', description: undefined, squaresSold: 100, totalPot: 1000, pricePerSquare: 10 }}
      event={{ awayTeamCode: 'BOS', homeTeamCode: 'LAL', scheduledTime: hours(-1) }}
      onPress={noop}
    />
    <SquaresGameCard
      squaresGame={{ ...game, id: 'sq-3', status: 'LOCKED', title: 'Thanksgiving Squares', description: undefined, squaresSold: 100, totalPot: 500 }}
      event={{ awayTeamCode: 'NYG', homeTeamCode: 'DAL', scheduledTime: hours(2) }}
      onPress={noop}
    />
  </View>
);

export const Finished = () => (
  <View style={pad}>
    <SquaresGameCard
      squaresGame={{ ...game, id: 'sq-4', status: 'RESOLVED', title: 'Super Bowl LX Squares', description: undefined, squaresSold: 100, totalPot: 2000, pricePerSquare: 20 }}
      event={{ awayTeamCode: 'PHI', homeTeamCode: 'KC', scheduledTime: hours(-200) }}
      onPress={noop}
    />
    <SquaresGameCard
      squaresGame={{ ...game, id: 'sq-5', status: 'CANCELLED', title: 'Monday Night Squares', description: undefined, squaresSold: 18, totalPot: 90 }}
      event={{ awayTeamCode: 'SF', homeTeamCode: 'SEA', scheduledTime: hours(-30) }}
      onPress={noop}
    />
  </View>
);

export const Compact = () => (
  <View style={pad}>
    <SquaresGameCard squaresGame={{ ...game, id: 'sq-6', squaresSold: 24, totalPot: 120 }} event={event} onPress={noop} compact />
  </View>
);

export const WithoutEvent = () => (
  <View style={pad}>
    <SquaresGameCard
      squaresGame={{ ...game, id: 'sq-7', status: 'SETUP', title: 'Office March Madness Squares', description: 'Game to be picked once the bracket is set.', squaresSold: 8, totalPot: 40 }}
      onPress={noop}
    />
  </View>
);
