import { describe, expect, it } from 'vitest';
import { parseBetText, type ParseContext } from '../betTextParser';

// Saturday 14 November 2026, 3pm local
const now = new Date(2026, 10, 14, 15, 0);
const friends = [
  { id: 'u-mike', username: 'mikeb', displayName: 'Mike Brown' },
  { id: 'u-sara', username: 'sara22', displayName: 'Sara Lee' },
];
const event = {
  homeTeam: 'Kansas City Chiefs',
  awayTeam: 'Buffalo Bills',
  homeTeamShortName: 'Chiefs',
  awayTeamShortName: 'Bills',
  homeTeamCode: 'KC',
  awayTeamCode: 'BUF',
};
const ctx: ParseContext = { now, friends };
const parse = (text: string, extra: Partial<ParseContext> = {}) => parseBetText(text, { ...ctx, ...extra });

const minutesUntil = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 60000);
const tonight = minutesUntil(new Date(2026, 10, 14, 23, 59));
const tomorrowNight = minutesUntil(new Date(2026, 10, 15, 23, 59));

describe('parseBetText: whole sentences', () => {
  it('reads a sports bet against a checked-in game', () => {
    const r = parse('$20 says the Chiefs beat the Bills tonight', { event });
    expect(r).toMatchObject({
      template: 'custom',
      category: 'SPORTS',
      sideAName: 'Kansas City Chiefs',
      sideBName: 'Buffalo Bills',
      usesEvent: true,
      amount: 20,
      deadlineMinutes: tonight,
      mySide: 'A',
      title: 'The Chiefs beat the Bills tonight',
    });
  });

  it('makes a bet with one friend head-to-head, keeping yes/no sides', () => {
    const r = parse('Bet Mike $10 it rains tomorrow');
    expect(r).toMatchObject({
      template: 'head-to-head',
      category: 'WEATHER',
      sideAName: 'Yes',
      sideBName: 'No',
      friendIds: ['u-mike'],
      amount: 10,
      deadlineMinutes: tomorrowNight,
      title: 'It rains tomorrow',
    });
  });

  it('names the two people in a "me vs friend" bet', () => {
    const r = parse('Me vs Mike at golf Sunday for 20 bucks');
    expect(r).toMatchObject({
      template: 'head-to-head',
      category: 'SPORTS',
      sideAName: 'I win',
      sideBName: 'Mike wins',
      mySide: 'A',
      amount: 20,
      deadlineMinutes: tomorrowNight,
    });
  });

  it('reads an over/under and the side taken', () => {
    const r = parse("Over/under 45.5 points tonight, I'll take the over");
    expect(r).toMatchObject({
      template: 'over-under',
      category: 'SPORTS',
      sideAName: 'Over',
      sideBName: 'Under',
      mySide: 'A',
      title: 'Over/under 45.5 points tonight',
    });
    expect(parse('o/u 3.5 goals, I take the under').mySide).toBe('B');
  });

  it('reads a pool from a list after a colon or a dash', () => {
    expect(parse('Who wins Survivor: Ana, Ben or Cal')).toMatchObject({
      template: 'pool',
      category: 'ENTERTAINMENT',
      options: ['Ana', 'Ben', 'Cal'],
      title: 'Who wins Survivor?',
    });
    expect(parse('who wins best picture - Dune, Wicked, Anora, Conclave').options).toEqual([
      'Dune', 'Wicked', 'Anora', 'Conclave',
    ]);
    expect(parse('Who wins the race, Max, Lando, Oscar or Charles?').options).toEqual([
      'Max', 'Lando', 'Oscar', 'Charles',
    ]);
    expect(parse('Red vs Blue vs Green').options).toEqual(['Red', 'Blue', 'Green']);
  });

  it('does not make a pool of more than six options', () => {
    expect(parse('Pick one: a, b, c, d, e, f, g').template).not.toBe('pool');
  });

  it('reads a yes/no question about a stock', () => {
    expect(parse('Will AAPL close above 250 Friday?')).toMatchObject({
      template: 'yes-no',
      category: 'STOCKS',
      sideAName: 'Yes',
      sideBName: 'No',
      deadlineMinutes: minutesUntil(new Date(2026, 10, 20, 23, 59)),
      title: 'Will AAPL close above 250 Friday?',
    });
  });

  it('reads a player prop', () => {
    expect(parse('Mahomes throws 3+ TDs')).toMatchObject({ template: 'player-prop', category: 'SPORTS' });
    expect(parse('LeBron gets at least 30 points').template).toBe('player-prop');
  });

  it('reads next score, taking the sides from the checked-in game', () => {
    expect(parse('Who scores next?', { event })).toMatchObject({
      template: 'next-score',
      sideAName: 'Kansas City Chiefs',
      sideBName: 'Buffalo Bills',
      usesEvent: true,
    });
  });

  it('reads two sides from "vs", "or" and "beats"', () => {
    expect(parse('Lakers vs Celtics, my money is on the Celtics')).toMatchObject({
      sideAName: 'Lakers',
      sideBName: 'Celtics',
      mySide: 'B',
    });
    expect(parse('Pizza or tacos?')).toMatchObject({ sideAName: 'Pizza', sideBName: 'Tacos' });
    expect(parse('Duke beats UNC by Saturday')).toMatchObject({ sideAName: 'Duke', sideBName: 'UNC' });
  });

  it('orders the game teams as they are mentioned', () => {
    expect(parse('Bills or Chiefs', { event })).toMatchObject({
      sideAName: 'Buffalo Bills',
      sideBName: 'Kansas City Chiefs',
    });
  });

  it('invites several friends without making it head-to-head', () => {
    const r = parse('bet @sara22 and Mike a fiver that the anthem goes over 2 minutes');
    expect(r).toMatchObject({
      template: 'over-under',
      friendIds: ['u-sara', 'u-mike'],
      amount: 5,
      title: 'The anthem goes over 2 minutes',
    });
  });
});

describe('parseBetText: leaving the defaults alone', () => {
  it('sets nothing for empty text', () => {
    expect(parse('   ')).toEqual({ found: [] });
  });

  it('lists only what it understood', () => {
    const r = parse('Will it snow');
    expect(r.found).toEqual(expect.arrayContaining(['template', 'title', 'category']));
    expect(r.found).not.toContain('amount');
    expect(r.found).not.toContain('deadline');
    expect(r.amount).toBeUndefined();
    expect(r.deadlineMinutes).toBeUndefined();
    expect(r.friendIds).toBeUndefined();
  });

  it('reads a plain statement as yes/no, but does not claim it found the type', () => {
    const r = parse("Sara can't eat 10 wings");
    expect(r.template).toBe('yes-no');
    expect(r.found).not.toContain('template');
  });

  it('does not take "in 5 minutes" in the challenge as the deadline', () => {
    expect(parse("Sara can't eat 10 wings in 5 minutes").deadlineMinutes).toBeUndefined();
    expect(parse('Will it rain, closes in 45 minutes').deadlineMinutes).toBe(45);
  });

  it('does not split "or more" and "or not" into sides', () => {
    expect(parse('Bills win by 10 or more').sideBName).toBe('No');
    expect(parse('Will it rain or not').template).toBe('yes-no');
  });

  it('does not match a friend just because their name is a word in the bet', () => {
    expect(parse('Will Mike Trout hit a homer').friendIds).toBeUndefined();
  });

  it('does not guess a category from nothing', () => {
    expect(parse('Pizza or tacos?').category).toBeUndefined();
  });

  it('keeps the description as typed', () => {
    expect(parse('  bet  you $5   it snows ').description).toBe('bet you $5 it snows');
  });
});

describe('parseBetText: amounts', () => {
  it.each([
    ['$20 it snows', 20],
    ['$ 7.50 it snows', 7.5],
    ['15 bucks it snows', 15],
    ['twenty dollars it snows', 20],
    ['a fiver it snows', 5],
    ['for 3 dollars, it snows', 3],
  ])('%s', (text, amount) => {
    expect(parse(text).amount).toBe(amount);
  });

  it('does not read a ticker or a score as an amount', () => {
    expect(parse('$TSLA closes green').amount).toBeUndefined();
    expect(parse('Over 45.5 points').amount).toBeUndefined();
  });
});

describe('parseBetText: deadlines', () => {
  it.each([
    ['it snows in 2 hours', 120],
    ['it snows in an hour', 60],
    ['it snows in 3 days', 3 * 1440],
    ['it snows tonight', tonight],
    ['it snows today', tonight],
    ['it snows tomorrow', tomorrowNight],
    ['it snows by 8pm', 5 * 60],
    ['it snows by 9:30 am', minutesUntil(new Date(2026, 10, 15, 9, 30))],
    ['it snows tomorrow at noon', minutesUntil(new Date(2026, 10, 15, 12, 0))],
    ['it snows by Monday', minutesUntil(new Date(2026, 10, 16, 23, 59))],
    ['it snows Saturday', tonight],
    ['it snows next Saturday', minutesUntil(new Date(2026, 10, 21, 23, 59))],
    ['it snows this weekend', tomorrowNight],
    ['it snows next week', minutesUntil(new Date(2026, 10, 21, 23, 59))],
    ['it snows by end of the month', minutesUntil(new Date(2026, 10, 30, 23, 59))],
  ])('%s', (text, minutes) => {
    expect(parse(text).deadlineMinutes).toBe(minutes);
  });

  it('caps a deadline at a year', () => {
    expect(parse('it snows in 500 days').deadlineMinutes).toBe(365 * 24 * 60);
  });
});
