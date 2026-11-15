/**
 * How the Create screen applies what the question says (betTextParser.ts) to the rest of
 * the form while it is typed.
 *
 * - Only fields the text mentions are filled; everything else keeps what it holds.
 * - A field is filled when what the text says about it changes, so a field changed by
 *   hand afterwards stays as it was set until the text says something new about it.
 * - When the text stops saying it ("$20" deleted), the field goes back to what it held
 *   before, unless it was changed by hand in the meantime.
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
  /** What the text last filled in */
  applied: AutofillValues;
  /** What each of those fields held before the text filled it */
  before: AutofillValues;
}

export const EMPTY_AUTOFILL: AutofillState = { applied: {}, before: {} };

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

/**
 * What to change on the form for a new parse, and the state to keep for the next one.
 * `current` is what the form holds now.
 */
export function planAutofill(
  state: AutofillState,
  next: AutofillValues,
  current: AutofillValues,
): { set: AutofillValues; state: AutofillState } {
  const set: Record<string, unknown> = {};
  const applied: Record<string, unknown> = { ...state.applied };
  const before: Record<string, unknown> = { ...state.before };

  for (const key of KEYS) {
    const wanted = next[key];
    const hadApplied = key in state.applied;
    if (wanted !== undefined) {
      if (hadApplied && same(wanted, state.applied[key])) continue; // the text says the same
      if (!hadApplied) before[key] = current[key];
      applied[key] = wanted;
      if (!same(wanted, current[key])) set[key] = wanted;
    } else if (hadApplied) {
      // The text no longer says it: put back what was there, unless it was changed by hand
      if (same(current[key], state.applied[key]) && !same(current[key], state.before[key])) {
        set[key] = state.before[key];
      }
      delete applied[key];
      delete before[key];
    }
  }
  return { set: set as AutofillValues, state: { applied: applied as AutofillValues, before: before as AutofillValues } };
}
