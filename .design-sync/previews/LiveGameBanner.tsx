import React from 'react';
import { LiveGameBanner, View } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const event = {
  id: 'ev-1',
  externalId: '401671789',
  sport: 'NFL' as const,
  league: 'NFL',
  homeTeam: 'Kansas City Chiefs',
  awayTeam: 'Buffalo Bills',
  homeTeamShortName: 'Chiefs',
  awayTeamShortName: 'Bills',
  homeTeamCode: 'KC',
  awayTeamCode: 'BUF',
  venue: 'GEHA Field at Arrowhead Stadium',
  city: 'Kansas City',
  homeScore: 17,
  awayScore: 14,
  status: 'LIVE' as const,
  quarter: 'Q3',
  timeLeft: '8:42',
  scheduledTime: hours(-2),
  checkInCount: 42,
  betCount: 6,
};

const frame = { width: 390 };
const noop = () => {};

export const NotCheckedIn = () => (
  <View style={frame}>
    <LiveGameBanner nearbyEventsCount={3} onCheckInPress={noop} />
  </View>
);

export const CheckedInLive = () => (
  <View style={frame}>
    <LiveGameBanner checkedInEvent={event} onCheckInPress={noop} onCheckOutPress={noop} />
  </View>
);

export const Halftime = () => (
  <View style={frame}>
    <LiveGameBanner checkedInEvent={{ ...event, status: 'HALFTIME' as const, homeScore: 10, awayScore: 7 }} onCheckOutPress={noop} />
  </View>
);

export const Upcoming = () => (
  <View style={frame}>
    <LiveGameBanner
      checkedInEvent={{ ...event, status: 'UPCOMING' as const, homeScore: 0, awayScore: 0, scheduledTime: hours(3) }}
      onCheckOutPress={noop}
    />
  </View>
);

export const Final = () => (
  <View style={frame}>
    <LiveGameBanner checkedInEvent={{ ...event, status: 'FINISHED' as const, homeScore: 27, awayScore: 24 }} onCheckOutPress={noop} />
  </View>
);

export const NoNearbyEvents = () => (
  <View style={frame}>
    <LiveGameBanner nearbyEventsCount={0} onCheckInPress={noop} />
  </View>
);
