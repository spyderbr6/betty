/**
 * The Create Bet screen's decisions: suggested bets for the game you are at, closing
 * times, stake steps, the create button's wording and the checks before sending. Free of
 * Amplify and React Native imports so it is unit tested; the server still re-checks
 * everything (amplify/shared/createBetLogic.ts).
 *
 * Closing times are plain durations on purpose. Game moments ("End of Q3") were designed
 * but dropped: a game clock cannot be turned into a reliable time, and the live feed is not
 * dependable enough to close bets on. The creator, who is watching, closes a bet early
 * with endBetEarly instead.
 */

import { LIMITS } from '../../amplify/shared/createBetLogic';
import { MAX_OPTIONS, MIN_POOL_OPTIONS } from '../../amplify/shared/betOptions';
import { formatTeamName } from '../utils/formatting';

/** The kinds of bet the form makes. Squares has its own form. */
export type BetFormat = 'sides' | 'pool' | 'challenge';

/** The parts of a LiveEvent the suggestions read. */
export interface GameForSuggestions {
  sport?: string | null;
  status?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamShortName?: string | null;
  awayTeamShortName?: string | null;
  homeTeamCode?: string | null;
  awayTeamCode?: string | null;
}

/** The two teams as the form shows them: away first, as the app writes "away @ home". */
export function gameTeams(game: GameForSuggestions): { away: string; home: string } {
  return {
    away: formatTeamName(game.awayTeam, game.awayTeamShortName ?? undefined, game.awayTeamCode ?? undefined),
    home: formatTeamName(game.homeTeam, game.homeTeamShortName ?? undefined, game.homeTeamCode ?? undefined),
  };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/** One tap fills the question and the sides (or a pool's options). */
export interface BetSuggestion {
  id: string;
  /** The chip's text */
  label: string;
  /** The bet's question */
  title: string;
  format: 'sides' | 'pool';
  /** Two sides, or a pool's three to six options */
  options: string[];
  /**
   * The question still needs a number from the creator (an over/under line: the app has
   * no betting lines), so the screen puts the cursor in it.
   */
  needsNumber?: boolean;
}

const FOOTBALL = ['NFL', 'COLLEGE_FOOTBALL'];
const BASKETBALL = ['NBA', 'COLLEGE_BASKETBALL'];

/**
 * Suggested bets for the checked-in game. In-game ones ("this drive", "next goal") only
 * while it is being played; before kickoff only the whole-game ones. A finished game has
 * none.
 */
export function betSuggestions(game: GameForSuggestions | null | undefined): BetSuggestion[] {
  if (!game) return [];
  const status = game.status ?? 'UPCOMING';
  if (status === 'FINISHED' || status === 'CANCELLED' || status === 'POSTPONED') return [];
  const inGame = status === 'LIVE' || status === 'HALFTIME';
  const { away, home } = gameTeams(game);
  const sport = game.sport ?? 'OTHER';
  const teams = [away, home];
  const list: BetSuggestion[] = [];

  const whoWins: BetSuggestion =
    sport === 'SOCCER'
      ? { id: 'who-wins', label: 'Who wins', title: `${away} or ${home}?`, format: 'pool', options: [away, 'Draw', home] }
      : { id: 'who-wins', label: 'Who wins', title: `Who wins, ${away} or ${home}?`, format: 'sides', options: teams };
  const overUnder = (unit: string): BetSuggestion => ({
    id: 'over-under',
    label: `Over/Under ${unit}`,
    // Ends where the number goes: the screen puts the cursor there
    title: `Total ${unit}: over or under `,
    format: 'sides',
    options: ['Over', 'Under'],
    needsNumber: true,
  });

  if (FOOTBALL.includes(sport)) {
    if (inGame) {
      list.push(
        { id: 'away-drive', label: `${away} score this drive`, title: `${away} score on this drive?`, format: 'sides', options: ['Yes', 'No'] },
        { id: 'home-drive', label: `${home} score this drive`, title: `${home} score on this drive?`, format: 'sides', options: ['Yes', 'No'] },
        {
          id: 'next-score',
          label: 'Next score',
          title: 'Next score?',
          format: 'pool',
          options: [`${away} TD`, `${away} FG`, `${home} TD`, `${home} FG`, 'No score'],
        },
      );
    }
    list.push(whoWins, overUnder('points'));
  } else if (BASKETBALL.includes(sport)) {
    if (inGame) {
      list.push(
        { id: 'next-basket', label: 'Next basket', title: 'Who scores next?', format: 'sides', options: teams },
        { id: 'win-quarter', label: 'Wins this quarter', title: 'Who wins this quarter?', format: 'sides', options: teams },
      );
    }
    list.push(whoWins, overUnder('points'));
  } else if (sport === 'NHL' || sport === 'SOCCER') {
    if (inGame) {
      list.push({
        id: 'next-goal',
        label: 'Next goal',
        title: 'Who scores the next goal?',
        format: 'pool',
        options: [away, home, 'No more goals'],
      });
    }
    list.push(whoWins, overUnder('goals'));
  } else if (sport === 'MLB') {
    if (inGame) {
      list.push({ id: 'run-inning', label: 'Run this inning', title: 'A run scores this inning?', format: 'sides', options: ['Yes', 'No'] });
    }
    list.push(whoWins, overUnder('runs'));
  } else {
    list.push(whoWins);
  }
  return list;
}

// ---------------------------------------------------------------------------
// Closing times
// ---------------------------------------------------------------------------

export type CloseTimeId = '15m' | '30m' | '1h' | 'tonight' | '1d' | '1w' | 'date';

export interface CloseTimeOption {
  id: CloseTimeId;
  label: string;
}

const FIXED_MINUTES: Partial<Record<CloseTimeId, number>> = {
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '1d': 24 * 60,
  '1w': 7 * 24 * 60,
};

/** Tonight means 11:59 PM, and is offered only while that is at least this far off. */
const TONIGHT_MIN_MINUTES = 90;

function minutesToTonight(now: Date): number {
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  return Math.floor((end.getTime() - now.getTime()) / 60_000);
}

/** The closing times offered now, in order. "Pick a date" is always last. */
export function closeTimeOptions(now: Date): CloseTimeOption[] {
  const options: CloseTimeOption[] = [
    { id: '15m', label: '15 min' },
    { id: '30m', label: '30 min' },
    { id: '1h', label: '1 hour' },
  ];
  if (minutesToTonight(now) >= TONIGHT_MIN_MINUTES) options.push({ id: 'tonight', label: 'Tonight' });
  options.push({ id: '1d', label: '1 day' }, { id: '1w', label: '1 week' }, { id: 'date', label: 'Pick a date' });
  return options;
}

/** The default: short while you are at a game being played, an hour otherwise. */
export function defaultCloseTime(atLiveGame: boolean): CloseTimeId {
  return atLiveGame ? '15m' : '1h';
}

/**
 * The deadline in whole minutes, as the server takes it; null when it is not usable (a
 * picked date in the past or more than a year out, or none picked).
 */
export function closeMinutes(id: CloseTimeId, now: Date, pickedDate?: Date | null): number | null {
  const fixed = FIXED_MINUTES[id];
  if (fixed !== undefined) return fixed;
  const minutes =
    id === 'tonight'
      ? minutesToTonight(now)
      : pickedDate
        ? Math.ceil((pickedDate.getTime() - now.getTime()) / 60_000)
        : NaN;
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= LIMITS.deadlineMinutes ? minutes : null;
}

/** "9:56 PM" today, "Tue 9:56 PM" within a week, "Nov 24, 9:56 PM" after that. */
export function formatCloseAt(minutes: number, now: Date): string {
  const at = new Date(now.getTime() + minutes * 60_000);
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return time;
  if (minutes < 6 * 24 * 60) return `${at.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

// ---------------------------------------------------------------------------
// Stake
// ---------------------------------------------------------------------------

export const STAKE_STEPS = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500] as const;

/** The stake a new bet starts at when there is no last stake to repeat. */
export const DEFAULT_STAKE = 5;

/**
 * The next stake up or down the steps. A stake typed between steps moves to the
 * neighbouring step; the bottom step stays put going down, and the top going up.
 */
export function stepStake(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return STAKE_STEPS.find((step) => step > current + 1e-9) ?? STAKE_STEPS[STAKE_STEPS.length - 1];
  }
  const lower = [...STAKE_STEPS].reverse().find((step) => step < current - 1e-9);
  return lower ?? STAKE_STEPS[0];
}

/** A stake the server accepts: positive, in whole cents. */
export function isValidStake(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

/** A remembered last stake, if it is still a usable one. */
export function restoreStake(saved: string | null | undefined): number {
  const amount = saved ? Number(saved) : NaN;
  return isValidStake(amount) ? amount : DEFAULT_STAKE;
}

/** "$5", or "$7.50" when there are cents. */
export function formatStake(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// The draft: checks and wording
// ---------------------------------------------------------------------------

export interface BetDraft {
  format: BetFormat;
  title: string;
  /** The optional "Add details" text */
  details: string;
  /** Two side names, or a pool's option names, in key order */
  options: string[];
  /** The index into `options` the creator backs; null when not picked */
  pickedIndex: number | null;
  stake: number;
  /** Deadline in minutes; null when the chosen closing time is not usable */
  closeMinutes: number | null;
}

/** What to tell the creator before sending, or null when the draft is ready. */
export function draftProblem(draft: BetDraft): { title: string; message: string } | null {
  if (!draft.title.trim()) return { title: "What's the bet?", message: 'Type the question everyone is betting on.' };
  const names = draft.options.map((name) => name.trim());
  if (draft.format === 'pool') {
    if (names.length < MIN_POOL_OPTIONS || names.length > MAX_OPTIONS) {
      return { title: 'Options', message: `A pool has ${MIN_POOL_OPTIONS} to ${MAX_OPTIONS} options.` };
    }
  } else if (names.length !== 2) {
    return { title: 'Sides', message: 'A bet has two sides.' };
  }
  if (names.some((name) => !name)) {
    return {
      title: draft.format === 'pool' ? 'Missing Option' : 'Missing Side',
      message: draft.format === 'pool' ? 'Name every option, or remove the ones you do not need.' : 'Name both sides.',
    };
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    return {
      title: draft.format === 'pool' ? 'Duplicate Option' : 'Same Sides',
      message: draft.format === 'pool' ? 'Each option needs a different name.' : 'The two sides need different names.',
    };
  }
  if (draft.pickedIndex === null || draft.pickedIndex < 0 || draft.pickedIndex >= names.length) {
    return draft.format === 'pool'
      ? { title: 'Pick an Option', message: 'Tap the option you are backing.' }
      : { title: 'Pick a Side', message: 'Tap the side you are backing.' };
  }
  if (!isValidStake(draft.stake)) return { title: 'Stake', message: 'Enter a stake in dollars and cents.' };
  if (draft.closeMinutes === null) {
    return { title: 'Closing Time', message: 'Pick a closing time in the future, at most a year out.' };
  }
  return null;
}

/**
 * The server requires a description; the form makes details optional. Without any, the
 * game ("Bills @ Chiefs") stands in, or the question itself away from a game.
 */
export function betDescription(details: string, title: string, game: GameForSuggestions | null | undefined): string {
  const typed = details.trim();
  if (typed) return typed;
  if (game) {
    const { away, home } = gameTeams(game);
    return `${away} @ ${home}`;
  }
  return title.trim();
}

/** The sticky create button's two lines. */
export function createButtonText(params: {
  format: BetFormat;
  stake: number;
  /** The side or option the creator backs; null when not picked */
  pickName: string | null;
  /** A challenge's opponent, when picked */
  opponentName?: string | null;
  isPrivate: boolean;
  /** Friends being invited */
  inviteCount: number;
  /** Of those, how many are at the same game */
  atGameCount: number;
  closeAt: string | null;
  overBalance: boolean;
}): { label: string; detail: string } {
  const stake = formatStake(params.stake);
  if (params.overBalance) {
    return { label: 'Add funds', detail: `Your balance does not cover the ${stake} stake` };
  }
  let label: string;
  if (!params.pickName) {
    label = params.format === 'pool' ? 'Pick your option' : 'Pick your side';
  } else if (params.format === 'challenge' && params.opponentName) {
    label = `Challenge ${params.opponentName} · ${stake}`;
  } else {
    label = `Create · ${stake} on ${params.pickName}`;
  }

  const parts: string[] = [];
  if (params.format === 'challenge') {
    parts.push(params.opponentName ? `${params.opponentName} gets the other side` : 'One person can take the other side');
  } else {
    parts.push(params.isPrivate ? 'Only invited people can join' : 'Anyone can join');
  }
  if (params.inviteCount > 0 && params.format !== 'challenge') {
    parts.push(
      params.atGameCount === params.inviteCount
        ? `invites ${params.inviteCount} at the game`
        : `invites ${params.inviteCount}`,
    );
  }
  if (params.closeAt) parts.push(`closes ${params.closeAt}`);
  return { label, detail: parts.join(' · ') };
}

/** "Morgan", "Morgan and Sam", "Morgan, Sam and Priya". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
