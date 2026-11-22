import { describe, expect, it } from 'vitest';
import { parseBetText, type ParseContext } from '../betTextParser';

// Saturday 14 November 2026, 3pm local
const now = new Date(2026, 10, 14, 15, 0);
const friends = [
  { id: 'u-mike', username: 'mikeb', displayName: 'Mike Brown' },
  { id: 'u-sara', username: 'sara22', displayName: 'Sara Lee' },
];
// The form shows "Bills" and "Chiefs", away first
const event = {
  sport: 'NFL',
  status: 'LIVE',
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

describe('parseBetText: whole questions', () => {
  it('reads a bet on the checked-in game, with the teams as the form names them', () => {
    expect(parse('$20 says the Chiefs beat the Bills tonight', { event })).toEqual({
      format: 'sides',
      options: ['Chiefs', 'Bills'],
      pickedIndex: 0,
      stake: 20,
      deadlineMinutes: tonight,
      category: 'SPORTS',
      cleanTitle: 'The Chiefs beat the Bills tonight',
    });
  });

  it('makes a bet against one named friend a 1 v 1, keeping yes/no sides', () => {
    expect(parse('Bet Mike $10 it rains tomorrow')).toEqual({
      format: 'challenge',
      opponentId: 'u-mike',
      options: ['Yes', 'No'],
      pickedIndex: 0,
      stake: 10,
      deadlineMinutes: tomorrowNight,
      category: 'WEATHER',
      cleanTitle: 'It rains tomorrow',
    });
  });

  it('names the two people in "me vs friend"', () => {
    expect(parse('Me vs Mike at golf Sunday for 20 bucks')).toMatchObject({
      format: 'challenge',
      opponentId: 'u-mike',
      options: ['I win', 'Mike wins'],
      pickedIndex: 0,
      stake: 20,
      deadlineMinutes: tomorrowNight,
      category: 'SPORTS',
      cleanTitle: 'Me vs Mike at golf Sunday',
    });
  });

  it('reads an over/under and the side taken', () => {
    expect(parse("Over/under 45.5 points tonight, I'll take the over")).toMatchObject({
      format: 'sides',
      options: ['Over', 'Under'],
      pickedIndex: 0,
      cleanTitle: 'Over/under 45.5 points tonight',
    });
    expect(parse('o/u 3.5 goals, I take the under').pickedIndex).toBe(1);
    expect(parse('$5 says under 45.5 points').pickedIndex).toBe(1);
  });

  it('reads a pool, and takes the list out of the question', () => {
    expect(parse('Who wins Survivor: Ana, Ben or Cal')).toEqual({
      format: 'pool',
      options: ['Ana', 'Ben', 'Cal'],
      category: 'ENTERTAINMENT',
      cleanTitle: 'Who wins Survivor?',
    });
    expect(parse('Who wins the Super Bowl? Chiefs, Bills or Eagles')).toMatchObject({
      format: 'pool',
      options: ['Chiefs', 'Bills', 'Eagles'],
      cleanTitle: 'Who wins the Super Bowl?',
    });
    expect(parse('who wins best picture - Dune, Wicked, Anora, Conclave').options).toEqual([
      'Dune', 'Wicked', 'Anora', 'Conclave',
    ]);
    expect(parse('Red vs Blue vs Green').options).toEqual(['Red', 'Blue', 'Green']);
  });

  it('does not make a pool of more than six options', () => {
    expect(parse('Pick one: a, b, c, d, e, f, g').format).not.toBe('pool');
  });

  it('reads a yes/no question, leaving the question as typed', () => {
    expect(parse('Will AAPL close above 250 Friday?')).toEqual({
      format: 'sides',
      options: ['Yes', 'No'],
      deadlineMinutes: minutesUntil(new Date(2026, 10, 20, 23, 59)),
      category: 'STOCKS',
    });
  });

  it('reads next score at a game as the two teams, away first', () => {
    expect(parse('Who scores next?', { event }).options).toEqual(['Bills', 'Chiefs']);
  });

  it('orders the teams as they are mentioned', () => {
    expect(parse('Chiefs or Bills', { event }).options).toEqual(['Chiefs', 'Bills']);
    expect(parse('Buffalo vs KC', { event }).options).toEqual(['Bills', 'Chiefs']);
  });

  it('reads two sides from "vs", "or" and "beats", and the side backed', () => {
    expect(parse('Lakers vs Celtics, my money is on the Celtics')).toMatchObject({
      options: ['Lakers', 'Celtics'],
      pickedIndex: 1,
      cleanTitle: 'Lakers vs Celtics',
    });
    expect(parse('Pizza or tacos?').options).toEqual(['Pizza', 'Tacos']);
    expect(parse('Duke beats UNC by Saturday').options).toEqual(['Duke', 'UNC']);
  });

  it('invites several friends without making it a 1 v 1', () => {
    expect(parse('bet @sara22 and Mike a fiver that the anthem goes over 2 minutes')).toMatchObject({
      format: 'sides',
      options: ['Over', 'Under'],
      friendIds: ['u-sara', 'u-mike'],
      stake: 5,
      cleanTitle: 'The anthem goes over 2 minutes',
    });
  });
});

describe('parseBetText: leaving the rest of the form alone', () => {
  it('says nothing about empty text', () => {
    expect(parse('   ')).toEqual({});
  });

  it('says nothing about a statement with no clues', () => {
    expect(parse('Sam makes the early train')).toEqual({});
  });

  it('does not read an open question as yes/no', () => {
    expect(parse('Who wins the Super Bowl?')).toEqual({ category: 'SPORTS' });
  });

  it('only gives a cleaned question when words went elsewhere', () => {
    expect(parse('Will it snow').cleanTitle).toBeUndefined();
    expect(parse('will it snow tomorrow?').cleanTitle).toBeUndefined();
    expect(parse('$5 will it snow').cleanTitle).toBe('Will it snow');
  });

  it('does not take "in 5 minutes" in the challenge as the closing time', () => {
    expect(parse("Sara can't eat 10 wings in 5 minutes").deadlineMinutes).toBeUndefined();
    expect(parse('Will it rain, closes in 45 minutes').deadlineMinutes).toBe(45);
  });

  it('does not split "or more" and "or not" into sides', () => {
    expect(parse('Bills win by 10 or more').options).toBeUndefined();
    expect(parse('Will it rain or not').options).toEqual(['Yes', 'No']);
  });

  it('does not match a friend just because their name is a word in the bet', () => {
    const r = parse('Will Mike Trout hit a homer');
    expect(r.friendIds).toBeUndefined();
    expect(r.opponentId).toBeUndefined();
  });

  it('does not guess a category from nothing', () => {
    expect(parse('Pizza or tacos?').category).toBeUndefined();
  });

  it('does not pick a side for a pool nobody picked in', () => {
    expect(parse('I bet: Ana, Ben or Cal').pickedIndex).toBeUndefined();
  });
});

describe('parseBetText: the "type it" design', () => {
  it('backs a team named to win, against the other one', () => {
    expect(parse('Bills win tonight', { event })).toMatchObject({ options: ['Bills', 'Chiefs'], pickedIndex: 0 });
    expect(parse('Chiefs win tonight', { event })).toMatchObject({ options: ['Bills', 'Chiefs'], pickedIndex: 1 });
  });

  it('reads "scores next" as yes / no, saying yes', () => {
    expect(parse('I bet a dollar that the Steelers score next', { event })).toMatchObject({
      format: 'sides',
      options: ['Yes', 'No'],
      pickedIndex: 0,
      stake: 1,
      deadlineMinutes: 15,
      guesses: ['deadline'],
      cleanTitle: 'The Steelers score next',
    });
    // Away from a game too, with no close time to guess
    const away = parse('Steelers score next');
    expect(away).toMatchObject({ options: ['Yes', 'No'], pickedIndex: 0 });
    expect(away.deadlineMinutes).toBeUndefined();
    expect(parse('Bills next to score', { event })).toMatchObject({ options: ['Yes', 'No'], pickedIndex: 0 });
  });

  it('asks without picking: "Will the Bills score next?"', () => {
    const r = parse('Will the Bills score next?', { event });
    expect(r.options).toEqual(['Yes', 'No']);
    expect(r.pickedIndex).toBeUndefined();
  });

  it('keeps the two teams for an open "who scores next"', () => {
    expect(parse('Who scores next?', { event }).options).toEqual(['Bills', 'Chiefs']);
  });

  it('does not pick a side when a named team is asked about', () => {
    const r = parse('Will the Bills win?', { event });
    expect(r.options).toEqual(['Bills', 'Chiefs']);
    expect(r.pickedIndex).toBeUndefined();
  });

  it('keeps yes / no for a team bet that is not about winning or scoring next', () => {
    expect(parse('Will the Bills score this drive?', { event }).options).toEqual(['Yes', 'No']);
  });

  it('makes "with" a friend a 1 v 1, with the side named', () => {
    expect(parse('$20 with Mike the Bills win tonight', { event })).toMatchObject({
      format: 'challenge',
      opponentId: 'u-mike',
      options: ['Bills', 'Chiefs'],
      pickedIndex: 0,
      stake: 20,
      cleanTitle: 'The Bills win tonight',
    });
  });

  it('reads money on a bare statement as a yes / no guess, with no side', () => {
    const r = parse('$5 Lamar throws for 2 or more TDs');
    expect(r).toMatchObject({ options: ['Yes', 'No'], stake: 5, guesses: ['options'] });
    expect(r.pickedIndex).toBeUndefined();
  });

  it('takes a bare clock time as the close away from a game, but not at one', () => {
    // 3pm now: the next 8:15 is this evening
    expect(parse('Sam makes the 8:15 train').deadlineMinutes).toBe(minutesUntil(new Date(2026, 10, 14, 20, 15)));
    expect(parse('Sam makes the 2:30 train').deadlineMinutes).toBe(minutesUntil(new Date(2026, 10, 15, 2, 30)));
    expect(parse('Sam makes the 8:15 train', { event }).deadlineMinutes).toBeUndefined();
  });
});

describe('parseBetText: stakes', () => {
  it.each([
    ['$20 it snows', 20],
    ['$ 7.50 it snows', 7.5],
    ['15 bucks it snows', 15],
    ['twenty dollars it snows', 20],
    ['a fiver it snows', 5],
    ['for 3 dollars, it snows', 3],
  ])('%s', (text, stake) => {
    expect(parse(text).stake).toBe(stake);
  });

  it('does not read a ticker or a line as a stake', () => {
    expect(parse('$TSLA closes green').stake).toBeUndefined();
    expect(parse('Over 45.5 points').stake).toBeUndefined();
  });
});

describe('parseBetText: closing times', () => {
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

  it('caps a closing time at a year', () => {
    expect(parse('it snows in 500 days').deadlineMinutes).toBe(365 * 24 * 60);
  });
});
