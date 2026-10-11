import { describe, expect, it } from 'vitest';
import { changedEventFields } from '../eventChangeLogic';

// A stored row as AppSync returns it (period scores as JSON text, plus fields the
// fetcher never sends)
const stored = {
  id: 'row-1',
  externalId: '401898400',
  sport: 'NBA',
  league: 'NBA',
  homeTeam: 'Golden State Warriors',
  awayTeam: 'Los Angeles Lakers',
  homeScore: 102,
  awayScore: 98,
  status: 'LIVE',
  isActive: 1,
  scheduledTime: '2026-10-11T02:30:00.000Z',
  homePeriodScores: '[35,58,85,102]',
  awayPeriodScores: '[25,51,73,98]',
  quarter: 'Period 4',
  timeLeft: '1:12',
  checkInCount: 4,
  betCount: 2,
  updatedAt: '2026-10-11T04:45:00.000Z',
};

// What the fetcher would send for the same game, unchanged
const sameWrite = {
  externalId: '401898400',
  sport: 'NBA',
  league: 'NBA',
  homeTeam: 'Golden State Warriors',
  awayTeam: 'Los Angeles Lakers',
  homeScore: 102,
  awayScore: 98,
  status: 'LIVE',
  isActive: 1,
  scheduledTime: '2026-10-11T02:30:00.000Z',
  homePeriodScores: JSON.stringify([35, 58, 85, 102]),
  awayPeriodScores: JSON.stringify([25, 51, 73, 98]),
  quarter: 'Period 4',
  timeLeft: '1:12',
};

describe('changedEventFields', () => {
  it('finds nothing to write when ESPN reports what is stored', () => {
    expect(changedEventFields(stored, sameWrite)).toEqual([]);
  });

  it('reports a score, clock or status change', () => {
    expect(changedEventFields(stored, { ...sameWrite, homeScore: 105, timeLeft: '0:40' })).toEqual([
      'homeScore',
      'timeLeft',
    ]);
    expect(changedEventFields(stored, { ...sameWrite, status: 'FINISHED', isActive: 0 })).toEqual([
      'status',
      'isActive',
    ]);
  });

  it('compares period scores by value, whether stored as text or parsed', () => {
    expect(changedEventFields({ ...stored, homePeriodScores: [35, 58, 85, 102] }, sameWrite)).toEqual([]);
    expect(changedEventFields(stored, { ...sameWrite, awayPeriodScores: JSON.stringify([25, 51, 73, 101]) })).toEqual([
      'awayPeriodScores',
    ]);
  });

  it('treats the first period score as a change', () => {
    const { homePeriodScores, awayPeriodScores, ...beforeTipOff } = stored;
    expect(changedEventFields(beforeTipOff, sameWrite)).toEqual(['homePeriodScores', 'awayPeriodScores']);
  });

  it('compares the scheduled time as an instant', () => {
    expect(changedEventFields(stored, { ...sameWrite, scheduledTime: '2026-10-11T02:30:00Z' })).toEqual([]);
    expect(changedEventFields(stored, { ...sameWrite, scheduledTime: '2026-10-11T03:00:00.000Z' })).toEqual([
      'scheduledTime',
    ]);
  });

  it('ignores stored fields the fetcher does not send', () => {
    const { quarter, timeLeft, ...withoutClock } = sameWrite;
    expect(changedEventFields({ ...stored, checkInCount: 9 }, withoutClock)).toEqual([]);
  });

  it('writes a field the row has never had', () => {
    expect(changedEventFields(stored, { ...sameWrite, venue: 'Chase Center' })).toEqual(['venue']);
  });
});
