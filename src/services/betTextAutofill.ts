/**
 * How the Create screen applies what the question says (betTextParser.ts) to the rest of
 * the form while it is typed ("Create Bet Type It" design).
 *
 * - Only fields the text mentions are filled; everything else keeps what it holds.
 * - A field set by hand is the creator's: later typing never changes it.
 * - When the text stops saying something ("$20" deleted), the field goes back to what it
 *   held before. Once the question is tidied (the "$20" moved to the stake), what was
 *   filled stays.
 * - Undo fill puts back what every filled field held, and the question fills nothing more
 *   until it is cleared.
 *
 * Pure, so it is unit tested; the screen reads and sets its own state around it.
 */

import { closeMinutes, type BetFormat, type CloseTimeId, type CloseTimeOption } from './createBetFlowLogic';
import type { ParsedBet } from './betTextParser';

/** A closing time as the form holds it: a chip, and the date when the chip is "Pick a date". */
export interface CloseChoice {
  id: CloseTimeId;
  /** ISO time, only for 'date' */
  date: string | null;
}

/** The form fields the question can fill, as plain values that compare by content. */
export interface AutofillValues {
  format?: BetFormat;
  sides?: string[];
  pool?: string[];
  pickedIndex?: number | null;
  stake?: number;
  close?: CloseChoice;
  /** Invited friends, sorted */
  friends?: string[];
  opponentId?: string | null;
}

export type AutofillKey = keyof AutofillValues;
const KEYS: AutofillKey[] = ['format', 'sides', 'pool', 'pickedIndex', 'stake', 'close', 'friends', 'opponentId'];

export interface AutofillState {
  /** What the text filled in, shown with ✦ */
  applied: AutofillValues;
  /** What each of those fields held before the text filled it */
  before: AutofillValues;
  /** Filled fields whose words were tidied out of the question: kept as they are */
  settled: AutofillKey[];
  /** Filled fields that are only guesses (a dashed outline) */
  guesses: AutofillKey[];
  /** After Undo fill: the question fills nothing until it is cleared */
  paused: boolean;
}

export const EMPTY_AUTOFILL: AutofillState = { applied: {}, before: {}, settled: [], guesses: [], paused: false };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const FIXED: Array<[CloseTimeId, number]> = [
  ['15m', 15],
  ['30m', 30],
  ['1h', 60],
  ['1d', 24 * 60],
  ['1w', 7 * 24 * 60],
];

/** The chip for a deadline in minutes: one of the fixed ones, Tonight, or a picked date. */
export function closeChoiceFor(minutes: number, now: Date, offered: CloseTimeOption[]): CloseChoice {
  const isOffered = (id: CloseTimeId) => offered.some((option) => option.id === id);
  const fixed = FIXED.find(([id, m]) => m === minutes && isOffered(id));
  if (fixed) return { id: fixed[0], date: null };
  const tonight = isOffered('tonight') ? closeMinutes('tonight', now) : null;
  if (tonight !== null && Math.abs(tonight - minutes) <= 1) return { id: 'tonight', date: null };
  const at = new Date(now.getTime() + minutes * 60_000);
  at.setSeconds(0, 0);
  return { id: 'date', date: at.toISOString() };
}

/**
 * The parse as form values. Friends are added to the ones invited before the text named
 * any, so a friend picked by hand is never dropped.
 */
export function autofillValues(
  parsed: ParsedBet,
  context: { now: Date; closeOptions: CloseTimeOption[]; state: AutofillState; current: AutofillValues },
): AutofillValues {
  const values: AutofillValues = {};
  if (parsed.format) values.format = parsed.format;
  if (parsed.options) {
    if (parsed.format === 'pool') values.pool = parsed.options;
    else values.sides = parsed.options;
  }
  if (parsed.pickedIndex !== undefined) values.pickedIndex = parsed.pickedIndex;
  if (parsed.stake !== undefined) values.stake = parsed.stake;
  if (parsed.deadlineMinutes !== undefined) {
    values.close = closeChoiceFor(parsed.deadlineMinutes, context.now, context.closeOptions);
  }
  if (parsed.friendIds?.length) {
    const base = context.state.before.friends ?? context.current.friends ?? [];
    values.friends = [...new Set([...base, ...parsed.friendIds])].sort();
  }
  if (parsed.opponentId) values.opponentId = parsed.opponentId;
  return values;
}

/** The form fields the parse only guessed. */
export function autofillGuesses(parsed: ParsedBet): AutofillKey[] {
  const keys: AutofillKey[] = [];
  if (parsed.guesses?.includes('options')) keys.push(parsed.format === 'pool' ? 'pool' : 'sides');
  if (parsed.guesses?.includes('deadline')) keys.push('close');
  return keys;
}

/**
 * What to change on the form for a new parse, and the state to keep for the next one.
 * `current` is what the form holds now.
 */
export function planAutofill(
  state: AutofillState,
  next: AutofillValues,
  current: AutofillValues,
  touched: readonly AutofillKey[] = [],
  guesses: readonly AutofillKey[] = [],
): { set: AutofillValues; state: AutofillState } {
  if (state.paused) return { set: {}, state };
  const set: Record<string, unknown> = {};
  const applied: Record<string, unknown> = { ...state.applied };
  const before: Record<string, unknown> = { ...state.before };
  const settled = new Set(state.settled);

  for (const key of KEYS) {
    if (touched.includes(key)) {
      // Set by hand: the creator's, not the text's
      delete applied[key];
      delete before[key];
      settled.delete(key);
      continue;
    }
    const wanted = next[key];
    const hadApplied = key in state.applied;
    if (wanted !== undefined) {
      if (hadApplied && same(wanted, state.applied[key])) continue; // the text says the same
      if (!hadApplied) before[key] = current[key];
      applied[key] = wanted;
      settled.delete(key);
      if (!same(wanted, current[key])) set[key] = wanted;
    } else if (hadApplied && !settled.has(key)) {
      // The text no longer says it: put back what was there, if it still holds the fill
      if (same(current[key], state.applied[key]) && !same(current[key], state.before[key])) {
        set[key] = state.before[key];
      }
      delete applied[key];
      delete before[key];
    }
  }
  return {
    set: set as AutofillValues,
    state: {
      applied: applied as AutofillValues,
      before: before as AutofillValues,
      settled: [...settled],
      guesses: guesses.filter((key) => key in applied),
      paused: false,
    },
  };
}

/** The question was tidied: what it filled stays, whatever is typed next. */
export function settleAutofill(state: AutofillState): AutofillState {
  return { ...state, settled: Object.keys(state.applied) as AutofillKey[] };
}

/** Undo fill: every filled field back to what it held, and no more filling. */
export function undoAutofill(state: AutofillState): { set: AutofillValues; state: AutofillState } {
  const set: Record<string, unknown> = {};
  for (const key of Object.keys(state.applied) as AutofillKey[]) set[key] = state.before[key];
  return { set: set as AutofillValues, state: { ...EMPTY_AUTOFILL, paused: true } };
}

/** The fields to mark ✦, and which of them are guesses. */
export function filledFields(state: AutofillState): { filled: Set<AutofillKey>; guessed: Set<AutofillKey> } {
  return { filled: new Set(Object.keys(state.applied) as AutofillKey[]), guessed: new Set(state.guesses) };
}
