import React from 'react';
import { PeriodResultsCard, View } from 'sidebet-ui';

const payoutStructure = { period1: 0.2, period2: 0.2, period3: 0.2, period4: 0.4 };

const event = {
  homeTeamCode: 'KC', homeTeam: 'Kansas City Chiefs',
  awayTeamCode: 'BUF', awayTeam: 'Buffalo Bills',
  homePeriodScores: [7, 10, 3, 7],
  awayPeriodScores: [3, 7, 14, 3],
};

const payout = (period: string, ownerName: string, userId: string, amount: number, home: number, away: number) => ({
  id: `pay-${period}`, period, ownerName, userId, amount, homeScoreFull: home, awayScoreFull: away,
});

const pad = { padding: 16, width: 380 };

export const Resolved = () => (
  <View style={pad}>
    <PeriodResultsCard
      game={{ status: 'RESOLVED', totalPot: 500, payoutStructure }}
      event={event}
      payouts={[
        payout('PERIOD_1', 'Sam Rivera', 'user-sam', 100, 7, 3),
        payout('PERIOD_2', 'Jordan Miles', 'user-jordan', 100, 17, 10),
        payout('PERIOD_3', 'Ava Chen', 'user-ava', 100, 20, 24),
        payout('PERIOD_4', 'Li Wei', 'user-li', 200, 27, 27),
      ]}
      currentUserId="user-jordan"
    />
  </View>
);

export const Live = () => (
  <View style={pad}>
    <PeriodResultsCard
      game={{ status: 'LIVE', totalPot: 500, payoutStructure }}
      event={{ ...event, homePeriodScores: [7, 10], awayPeriodScores: [3, 7] }}
      payouts={[
        payout('PERIOD_1', 'Sam Rivera', 'user-sam', 100, 7, 3),
        payout('PERIOD_2', 'Jordan Miles', 'user-jordan', 100, 17, 10),
      ]}
      currentUserId="user-jordan"
    />
  </View>
);

export const NotStarted = () => (
  <View style={pad}>
    <PeriodResultsCard
      game={{ status: 'LOCKED', totalPot: 1000, payoutStructure: JSON.stringify({ period2: 0.5, period4: 0.5 }) }}
      event={{ homeTeamCode: 'LAL', homeTeam: 'Los Angeles Lakers', awayTeamCode: 'BOS', awayTeam: 'Boston Celtics' }}
      payouts={[]}
      currentUserId="user-jordan"
    />
  </View>
);
