import { describe, expect, it } from 'vitest';
import {
  EVENT_CACHE_TTL_MS,
  LIVE_LOOKBACK_MS,
  eventWindowStart,
  isEventOver,
  toLiveEventData,
} from '../liveEventLogic';

describe('eventWindowStart', () => {
  it('reaches back exactly as far as a game can still be live', () => {
    const now = Date.parse('2026-10-11T20:00:00.000Z');
    expect(eventWindowStart(now)).toBe('2026-10-11T16:00:00.000Z');
    expect(Date.parse(eventWindowStart(now))).toBe(now - LIVE_LOOKBACK_MS);
  });
});

describe('EVENT_CACHE_TTL_MS', () => {
  it('matches the 15-minute fetcher, not a day', () => {
    expect(EVENT_CACHE_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe('isEventOver', () => {
  it('is true only for finished and cancelled games', () => {
    expect(isEventOver('FINISHED')).toBe(true);
    expect(isEventOver('CANCELLED')).toBe(true);
    for (const status of ['UPCOMING', 'LIVE', 'HALFTIME', 'POSTPONED', null, undefined]) {
      expect(isEventOver(status)).toBe(false);
    }
  });
});

describe('toLiveEventData', () => {
  const row = {
    id: 'row-1',
    externalId: '401898400',
    sport: 'NFL' as const,
    league: 'NFL',
    homeTeam: 'Jacksonville Jaguars',
    awayTeam: 'Philadelphia Eagles',
    homeTeamCode: 'JAX',
    awayTeamCode: 'PHI',
    homeScore: 10,
    awayScore: 14,
    status: 'LIVE' as const,
    quarter: 'Period 2',
    timeLeft: '3:21',
    scheduledTime: '2026-10-11T13:30:00.000Z',
    checkInCount: 3,
    betCount: 1,
  };

  it('carries the score, status and clock through', () => {
    expect(toLiveEventData(row)).toMatchObject({
      id: 'row-1',
      homeScore: 10,
      awayScore: 14,
      status: 'LIVE',
      quarter: 'Period 2',
      timeLeft: '3:21',
    });
  });

  it('fills defaults for the nulls AppSync sends', () => {
    const mapped = toLiveEventData({
      ...row,
      sport: null,
      league: null,
      homeScore: null,
      awayScore: null,
      status: null,
      venue: null,
      checkInCount: null,
      betCount: null,
    });
    expect(mapped).toMatchObject({ sport: 'OTHER', league: '', homeScore: 0, awayScore: 0, status: 'UPCOMING', checkInCount: 0, betCount: 0 });
    expect(mapped.venue).toBeUndefined();
  });
});
