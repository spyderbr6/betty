import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STAKE,
  STAKE_STEPS,
  betDescription,
  betSuggestions,
  closeMinutes,
  closeTimeOptions,
  createButtonText,
  defaultCloseTime,
  draftProblem,
  formatCloseAt,
  formatStake,
  friendName,
  initialPickedDate,
  initials,
  gameTeams,
  isValidStake,
  joinNames,
  restoreStake,
  stepStake,
  type BetDraft,
} from '../createBetFlowLogic';

const game = {
  sport: 'NFL',
  status: 'LIVE',
  homeTeam: 'Kansas City Chiefs',
  awayTeam: 'Buffalo Bills',
  homeTeamShortName: 'Chiefs',
  awayTeamShortName: 'Bills',
};

describe('gameTeams', () => {
  it('uses the short names, away first', () => {
    expect(gameTeams(game)).toEqual({ away: 'Bills', home: 'Chiefs' });
  });

  it('falls back to the last word of the full name', () => {
    expect(gameTeams({ homeTeam: 'Green Bay Packers', awayTeam: 'Chicago Bears' })).toEqual({
      away: 'Bears',
      home: 'Packers',
    });
  });
});

describe('betSuggestions', () => {
  it('offers in-game football bets while the game is live', () => {
    const ids = betSuggestions(game).map((s) => s.id);
    expect(ids).toEqual(['drive', 'next-score', 'who-wins', 'over-under']);
  });

  it('fills the next-score pool with both teams and no score', () => {
    const nextScore = betSuggestions(game).find((s) => s.id === 'next-score')!;
    expect(nextScore.format).toBe('pool');
    expect(nextScore.options).toEqual(['Bills TD', 'Bills FG', 'Chiefs TD', 'Chiefs FG', 'No score']);
  });

  it('keeps every suggestion within what the server accepts', () => {
    for (const sport of ['NFL', 'NBA', 'NHL', 'SOCCER', 'MLB', 'OTHER', 'COLLEGE_FOOTBALL']) {
      for (const suggestion of betSuggestions({ ...game, sport })) {
        const { options, format } = suggestion;
        if (format === 'pool') expect(options.length).toBeGreaterThanOrEqual(3);
        else expect(options).toHaveLength(2);
        expect(options.length).toBeLessThanOrEqual(6);
        expect(new Set(options.map((o) => o.toLowerCase())).size).toBe(options.length);
        expect(suggestion.title.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('only offers whole-game bets before kickoff', () => {
    expect(betSuggestions({ ...game, status: 'UPCOMING' }).map((s) => s.id)).toEqual(['who-wins', 'over-under']);
  });

  it('offers nothing for a finished game, or with no game', () => {
    expect(betSuggestions({ ...game, status: 'FINISHED' })).toEqual([]);
    expect(betSuggestions(null)).toEqual([]);
  });

  it('lets a soccer match end in a draw', () => {
    const whoWins = betSuggestions({ ...game, sport: 'SOCCER' }).find((s) => s.id === 'who-wins')!;
    expect(whoWins.format).toBe('pool');
    expect(whoWins.options).toEqual(['Bills', 'Draw', 'Chiefs']);
  });

  it('asks for the over/under number instead of inventing a line', () => {
    const overUnder = betSuggestions(game).find((s) => s.id === 'over-under')!;
    expect(overUnder.needsNumber).toBe(true);
    expect(overUnder.options).toEqual(['Over', 'Under']);
    expect(overUnder.title).not.toMatch(/\d/);
  });
});

describe('closing times', () => {
  const evening = new Date(2026, 10, 14, 21, 41); // 9:41 PM
  const afternoon = new Date(2026, 10, 14, 15, 0);

  it('offers Tonight only while 11:59 PM is far enough off', () => {
    expect(closeTimeOptions(afternoon).map((o) => o.id)).toContain('tonight');
    expect(closeTimeOptions(new Date(2026, 10, 14, 22, 45)).map((o) => o.id)).not.toContain('tonight');
    expect(closeTimeOptions(evening).at(-1)?.id).toBe('date');
  });

  it('turns each choice into whole minutes', () => {
    expect(closeMinutes('15m', evening)).toBe(15);
    expect(closeMinutes('1w', evening)).toBe(7 * 24 * 60);
    expect(closeMinutes('tonight', afternoon)).toBe(8 * 60 + 59);
  });

  it('rounds a picked date up, and refuses one in the past or too far out', () => {
    expect(closeMinutes('date', evening, new Date(evening.getTime() + 90.5 * 60_000))).toBe(91);
    expect(closeMinutes('date', evening, new Date(evening.getTime() - 60_000))).toBeNull();
    expect(closeMinutes('date', evening, new Date(evening.getTime() + 400 * 24 * 3600_000))).toBeNull();
    expect(closeMinutes('date', evening, null)).toBeNull();
  });

  it('starts short at a game being played', () => {
    expect(defaultCloseTime(true)).toBe('15m');
    expect(defaultCloseTime(false)).toBe('1h');
  });

  it('shows the time today, the weekday this week, the date after', () => {
    expect(formatCloseAt(15, evening)).toBe('9:56 PM');
    expect(formatCloseAt(24 * 60, evening)).toBe('Sun 9:41 PM');
    expect(formatCloseAt(7 * 24 * 60, evening)).toBe('Nov 21, 9:41 PM');
  });
});

describe('stake', () => {
  it('steps up and down the steps, stopping at the ends', () => {
    expect(stepStake(5, 1)).toBe(10);
    expect(stepStake(5, -1)).toBe(2);
    expect(stepStake(1, -1)).toBe(1);
    expect(stepStake(500, 1)).toBe(500);
  });

  it('moves a typed stake to the neighbouring step', () => {
    expect(stepStake(7, 1)).toBe(10);
    expect(stepStake(7, -1)).toBe(5);
    expect(stepStake(0.5, -1)).toBe(STAKE_STEPS[0]);
  });

  it('accepts only whole cents above zero', () => {
    expect(isValidStake(7.5)).toBe(true);
    expect(isValidStake(0)).toBe(false);
    expect(isValidStake(1.234)).toBe(false);
    expect(isValidStake(NaN)).toBe(false);
  });

  it('repeats a usable last stake, else the default', () => {
    expect(restoreStake('20')).toBe(20);
    expect(restoreStake('nope')).toBe(DEFAULT_STAKE);
    expect(restoreStake('-3')).toBe(DEFAULT_STAKE);
    expect(restoreStake(null)).toBe(DEFAULT_STAKE);
  });

  it('shows cents only when there are some', () => {
    expect(formatStake(5)).toBe('$5');
    expect(formatStake(7.5)).toBe('$7.50');
  });
});

describe('draftProblem', () => {
  const ready: BetDraft = {
    format: 'sides',
    title: 'Chiefs score on this drive?',
    details: '',
    options: ['Yes', 'No'],
    pickedIndex: 0,
    stake: 5,
    closeMinutes: 15,
  };

  it('passes a ready draft', () => {
    expect(draftProblem(ready)).toBeNull();
    expect(draftProblem({ ...ready, format: 'pool', options: ['A', 'B', 'C'], pickedIndex: 2 })).toBeNull();
  });

  it('asks for the question, then the names, then the pick', () => {
    expect(draftProblem({ ...ready, title: '  ' })?.title).toBe("What's the bet?");
    expect(draftProblem({ ...ready, options: ['Yes', ' '] })?.title).toBe('Missing Side');
    expect(draftProblem({ ...ready, options: ['Yes', 'yes'] })?.title).toBe('Same Sides');
    expect(draftProblem({ ...ready, pickedIndex: null })?.title).toBe('Pick a Side');
  });

  it('checks a pool has three to six distinct options', () => {
    const pool = { ...ready, format: 'pool' as const, pickedIndex: 0 };
    expect(draftProblem({ ...pool, options: ['A', 'B'] })?.title).toBe('Options');
    expect(draftProblem({ ...pool, options: ['A', 'B', 'a'] })?.title).toBe('Duplicate Option');
    expect(draftProblem({ ...pool, options: ['A', 'B', 'C'], pickedIndex: 3 })?.title).toBe('Pick an Option');
  });

  it('refuses a bad stake or closing time', () => {
    expect(draftProblem({ ...ready, stake: 0 })?.title).toBe('Stake');
    expect(draftProblem({ ...ready, closeMinutes: null })?.title).toBe('Closing Time');
  });
});

describe('betDescription', () => {
  it('uses the details when typed', () => {
    expect(betDescription(' Loser buys wings ', 'Q', game)).toBe('Loser buys wings');
  });

  it('falls back to the game, then the question', () => {
    expect(betDescription('', 'Chiefs score?', game)).toBe('Bills @ Chiefs');
    expect(betDescription('', ' Sam makes the train ', null)).toBe('Sam makes the train');
  });
});

describe('createButtonText', () => {
  const base = {
    format: 'sides' as const,
    stake: 5,
    pickName: 'Yes',
    isPrivate: false,
    inviteCount: 4,
    atGameCount: 4,
    closeAt: '9:56 PM',
    overBalance: false,
  };

  it('names the stake, the pick, who can join and when it closes', () => {
    expect(createButtonText(base)).toEqual({
      label: 'Create · $5 on Yes',
      detail: 'Friends · invites 4 at the game · closes 9:56 PM',
    });
  });

  it('asks for a pick first', () => {
    expect(createButtonText({ ...base, pickName: null }).label).toBe('Pick your side');
    expect(createButtonText({ ...base, format: 'pool', pickName: null }).label).toBe('Pick your option');
  });

  it('says who is invited when not everyone is at the game, and when it is private', () => {
    expect(createButtonText({ ...base, isPrivate: true, atGameCount: 1 }).detail).toBe(
      'Invited only · invites 4 · closes 9:56 PM',
    );
    expect(createButtonText({ ...base, inviteCount: 0, atGameCount: 0 }).detail).toBe('Friends · closes 9:56 PM');
  });

  it('names the opponent of a challenge', () => {
    expect(createButtonText({ ...base, format: 'challenge', stake: 20, pickName: 'Chiefs', opponentName: 'Morgan' })).toEqual({
      label: 'Challenge Morgan · $20',
      detail: 'Morgan gets the other side · closes 9:56 PM',
    });
  });

  it('turns into Add funds when the stake is over the balance', () => {
    expect(createButtonText({ ...base, overBalance: true }).label).toBe('Add funds');
  });
});

describe('joinNames', () => {
  it('lists names the way a sentence does', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Morgan'])).toBe('Morgan');
    expect(joinNames(['Morgan', 'Sam'])).toBe('Morgan and Sam');
    expect(joinNames(['Morgan', 'Sam', 'Priya', 'Jordan'])).toBe('Morgan, Sam, Priya and Jordan');
  });
});

describe('initialPickedDate', () => {
  it('starts on the half hour at least an hour away', () => {
    expect(initialPickedDate(new Date(2026, 10, 14, 21, 41)).toTimeString().slice(0, 5)).toBe('23:00');
    expect(initialPickedDate(new Date(2026, 10, 14, 21, 10)).toTimeString().slice(0, 5)).toBe('22:30');
    expect(initialPickedDate(new Date(2026, 10, 14, 23, 50)).getDate()).toBe(15);
  });
});

describe('friend names', () => {
  it('prefers the display name, then the username, then the email', () => {
    expect(friendName({ displayName: 'Morgan', username: 'm1' })).toBe('Morgan');
    expect(friendName({ username: 'sam_k', email: 's@x.com' })).toBe('sam_k');
    expect(friendName({ email: 'priya@x.com' })).toBe('priya');
  });

  it('makes up to two initials', () => {
    expect(initials('Morgan Lee')).toBe('ML');
    expect(initials('sam_k_q')).toBe('SK');
    expect(initials('')).toBe('?');
  });
});
