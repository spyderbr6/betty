/**
 * Setting up a squares game from the Create screen: which games can take squares, the
 * game list's days, price steps, payout presets with their dollar amounts, and the friend
 * signal on a game. Free of Amplify and React Native imports so it is unit tested.
 *
 * The scheduled squares checker pays the shares (amplify/shared/squaresMoney.ts); a share
 * of 0 ("Final only") is recorded at $0 so the game still resolves.
 */

import { joinNames } from './createBetFlowLogic';

/** Squares never depend on a check-in: the list covers the same 14 days as before. */
export const SQUARES_DAYS_AHEAD = 14;

/** New games start open to everyone, like bets; "Invited only" is one tap. */
export const SQUARES_DEFAULT_PRIVATE = false;

export interface GameForSquares {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamShortName?: string | null;
  awayTeamShortName?: string | null;
  homeTeamCode?: string | null;
  awayTeamCode?: string | null;
  scheduledTime: string;
  status?: string | null;
  sport?: string | null;
  league?: string | null;
  round?: string | null;
}

/** A game takes squares only before kickoff: the grid needs every period. */
export function canTakeSquares(game: Pick<GameForSquares, 'scheduledTime' | 'status'>, now: Date): boolean {
  return (game.status ?? 'UPCOMING') === 'UPCOMING' && new Date(game.scheduledTime).getTime() > now.getTime();
}

/** Games whose team names (full, short or code) contain the search. */
export function searchGames<T extends GameForSquares>(games: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return games;
  return games.filter((game) =>
    [game.homeTeam, game.awayTeam, game.homeTeamShortName, game.awayTeamShortName, game.homeTeamCode, game.awayTeamCode]
      .filter(Boolean)
      .some((name) => (name as string).toLowerCase().includes(q)),
  );
}

/** "TODAY", "TOMORROW", "THIS SUNDAY · OCT 25" within a week, "SAT · NOV 21" after. */
export function dayLabel(date: Date, now: Date): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86_400_000);
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  if (days === 0) return `TODAY · ${monthDay}`;
  if (days === 1) return `TOMORROW · ${monthDay}`;
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  if (days < 7) return `THIS ${weekday} · ${monthDay}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} · ${monthDay}`;
}

/** Games in kickoff order, grouped by day. */
export function groupGamesByDay<T extends GameForSquares>(games: T[], now: Date): Array<{ label: string; games: T[] }> {
  const sorted = [...games].sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  const groups: Array<{ label: string; games: T[] }> = [];
  for (const game of sorted) {
    const label = dayLabel(new Date(game.scheduledTime), now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.games.push(game);
    else groups.push({ label, games: [game] });
  }
  return groups;
}

/** "Sun 4:25 PM": when the grid locks, which is kickoff. */
export function lockLabel(scheduledTime: string): string {
  const at = new Date(scheduledTime);
  return `${at.toLocaleDateString('en-US', { weekday: 'short' })} ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

export const PRICE_STEPS = [5, 10, 15, 20, 25, 50, 75, 100] as const;
export const DEFAULT_PRICE = 10;
export const SQUARES_PER_GRID = 100;

/** The next price up or down the steps, stopping at $5 and $100. */
export function stepPrice(current: number, direction: 1 | -1): number {
  if (direction === 1) return PRICE_STEPS.find((step) => step > current) ?? PRICE_STEPS[PRICE_STEPS.length - 1];
  return [...PRICE_STEPS].reverse().find((step) => step < current) ?? PRICE_STEPS[0];
}

/** What the pot comes to when every square sells. */
export function fullPot(price: number): number {
  return Math.round(price * SQUARES_PER_GRID * 100) / 100;
}

/** "$1,000", or "$1,012.50". */
export function formatDollars(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

/** Each period's share in whole percent: Q1, Half, Q3, Final. */
export type PayoutPercents = [number, number, number, number];

export const PAYOUT_PRESETS: Array<{ id: 'standard' | 'even' | 'final'; label: string; percents: PayoutPercents }> = [
  { id: 'standard', label: 'Standard', percents: [15, 25, 15, 45] },
  { id: 'even', label: 'Even', percents: [25, 25, 25, 25] },
  { id: 'final', label: 'Final only', percents: [0, 0, 0, 100] },
];

export const PERIOD_LABELS = ['Q1', 'Half', 'Q3', 'Final'] as const;

/** Each period's dollars from a full pot, labelled; periods with no share are left out. */
export function payoutAmounts(percents: PayoutPercents, pot: number): Array<{ label: string; amount: number }> {
  return percents
    .map((percent, i) => ({ label: PERIOD_LABELS[i], amount: Math.round(pot * percent) / 100 }))
    .filter((_, i) => percents[i] > 0);
}

export function percentsTotal(percents: PayoutPercents): number {
  return percents.reduce((sum, p) => sum + p, 0);
}

/** The structure the game stores: shares as fractions, keyed period1..period4. */
export function payoutStructure(percents: PayoutPercents): Record<'period1' | 'period2' | 'period3' | 'period4', number> {
  return { period1: percents[0] / 100, period2: percents[1] / 100, period3: percents[2] / 100, period4: percents[3] / 100 };
}

/** Which preset these percents are, or 'custom'. */
export function presetFor(percents: PayoutPercents): 'standard' | 'even' | 'final' | 'custom' {
  return PAYOUT_PRESETS.find((preset) => preset.percents.every((p, i) => p === percents[i]))?.id ?? 'custom';
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

/** "Morgan has squares on this", "Morgan and Sam have…", "Morgan, Sam and 2 others have…". */
export function friendSquaresSignal(names: string[]): string | null {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (unique.length === 0) return null;
  const shown = unique.length > 3 ? [...unique.slice(0, 2), `${unique.length - 2} others`] : unique;
  return `${joinNames(shown)} ${unique.length === 1 ? 'has' : 'have'} squares on this`;
}
