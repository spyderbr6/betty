import { describe, expect, it } from 'vitest';
import { isValidPayoutStructure } from '../../../amplify/shared/squaresMoney';
import {
  PAYOUT_PRESETS,
  canTakeSquares,
  dayLabel,
  formatDollars,
  friendSquaresSignal,
  fullPot,
  groupGamesByDay,
  lockLabel,
  payoutAmounts,
  payoutStructure,
  percentsTotal,
  presetFor,
  searchGames,
  stepPrice,
} from '../squaresSetupLogic';

const now = new Date(2026, 9, 21, 12, 0); // Wed Oct 21, noon
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const game = (id: string, scheduledTime: string, over: Record<string, unknown> = {}) => ({
  id,
  homeTeam: 'Dallas Cowboys',
  awayTeam: 'Philadelphia Eagles',
  homeTeamCode: 'DAL',
  awayTeamCode: 'PHI',
  scheduledTime,
  status: 'UPCOMING',
  ...over,
});

describe('canTakeSquares', () => {
  it('takes squares only before kickoff', () => {
    expect(canTakeSquares(game('a', at(25, 16, 25)), now)).toBe(true);
    expect(canTakeSquares(game('b', at(21, 11)), now)).toBe(false);
    expect(canTakeSquares(game('c', at(25, 16), { status: 'LIVE' }), now)).toBe(false);
  });
});

describe('the game list', () => {
  it('labels today, tomorrow, this week and later', () => {
    expect(dayLabel(new Date(2026, 9, 21, 20), now)).toBe('TODAY · OCT 21');
    expect(dayLabel(new Date(2026, 9, 22, 20), now)).toBe('TOMORROW · OCT 22');
    expect(dayLabel(new Date(2026, 9, 25, 13), now)).toBe('THIS SUNDAY · OCT 25');
    expect(dayLabel(new Date(2026, 10, 1, 13), now)).toBe('SUN · NOV 1');
  });

  it('groups games by day in kickoff order', () => {
    const groups = groupGamesByDay([game('late', at(25, 20, 20)), game('mon', at(26, 20, 15)), game('early', at(25, 13))], now);
    expect(groups.map((g) => [g.label, g.games.map((x) => x.id)])).toEqual([
      ['THIS SUNDAY · OCT 25', ['early', 'late']],
      ['THIS MONDAY · OCT 26', ['mon']],
    ]);
  });

  it('searches full names, short names and codes', () => {
    const games = [game('a', at(25, 13)), game('b', at(25, 16), { homeTeam: 'Chicago Bears', awayTeam: 'Green Bay Packers', homeTeamCode: 'CHI', awayTeamCode: 'GB' })];
    expect(searchGames(games, 'eagles').map((g) => g.id)).toEqual(['a']);
    expect(searchGames(games, 'gb').map((g) => g.id)).toEqual(['b']);
    expect(searchGames(games, '  ').map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('shows the lock time as weekday and time', () => {
    expect(lockLabel(at(25, 16, 25))).toBe('Sun 4:25 PM');
  });
});

describe('price', () => {
  it('steps between $5 and $100', () => {
    expect(stepPrice(10, 1)).toBe(15);
    expect(stepPrice(10, -1)).toBe(5);
    expect(stepPrice(5, -1)).toBe(5);
    expect(stepPrice(100, 1)).toBe(100);
  });

  it('shows the pot a full grid makes', () => {
    expect(fullPot(10)).toBe(1000);
    expect(formatDollars(fullPot(10))).toBe('$1,000');
    expect(formatDollars(12.5)).toBe('$12.50');
  });
});

describe('payouts', () => {
  it('turns a preset into dollars, leaving out periods with no share', () => {
    expect(payoutAmounts([15, 25, 15, 45], 1000)).toEqual([
      { label: 'Q1', amount: 150 },
      { label: 'Half', amount: 250 },
      { label: 'Q3', amount: 150 },
      { label: 'Final', amount: 450 },
    ]);
    expect(payoutAmounts([0, 0, 0, 100], 1000)).toEqual([{ label: 'Final', amount: 1000 }]);
  });

  it('stores every preset as a structure the server accepts', () => {
    for (const preset of PAYOUT_PRESETS) {
      expect(percentsTotal(preset.percents)).toBe(100);
      expect(isValidPayoutStructure(payoutStructure(preset.percents))).toBe(true);
    }
  });

  it('recognises a preset, and anything else as custom', () => {
    expect(presetFor([25, 25, 25, 25])).toBe('even');
    expect(presetFor([10, 20, 30, 40])).toBe('custom');
  });
});

describe('friendSquaresSignal', () => {
  it('names the friends with squares on a game', () => {
    expect(friendSquaresSignal([])).toBeNull();
    expect(friendSquaresSignal(['Morgan'])).toBe('Morgan has squares on this');
    expect(friendSquaresSignal(['Morgan', 'Sam', 'Morgan'])).toBe('Morgan and Sam have squares on this');
    expect(friendSquaresSignal(['Morgan', 'Sam', 'Priya', 'Jordan'])).toBe('Morgan, Sam and 2 others have squares on this');
  });
});
