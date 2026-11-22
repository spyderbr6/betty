import { describe, expect, it } from 'vitest';
import {
  autofillGuesses,
  autofillValues,
  closeChoiceFor,
  EMPTY_AUTOFILL,
  filledFields,
  planAutofill,
  settleAutofill,
  undoAutofill,
  type AutofillKey,
  type AutofillState,
  type AutofillValues,
} from '../betTextAutofill';
import { closeTimeOptions } from '../createBetFlowLogic';
import { parseBetText } from '../betTextParser';

// Saturday 14 November 2026, 3pm local
const now = new Date(2026, 10, 14, 15, 0);
const offered = closeTimeOptions(now);
const friends = [{ id: 'u-mike', username: 'mikeb', displayName: 'Mike Brown' }];

/** A form, as the screen holds it, that types into its question. */
function form(start: AutofillValues) {
  let values: AutofillValues = { ...start };
  let state: AutofillState = EMPTY_AUTOFILL;
  const touched = new Set<AutofillKey>();
  const apply = (set: AutofillValues) => {
    values = { ...values, ...set };
  };
  return {
    type(text: string) {
      const parsed = parseBetText(text, { now, friends });
      const next = autofillValues(parsed, { now, closeOptions: offered, state, current: values });
      const plan = planAutofill(state, next, values, [...touched], autofillGuesses(parsed));
      state = plan.state;
      apply(plan.set);
      return plan.set;
    },
    byHand(change: AutofillValues) {
      for (const key of Object.keys(change) as AutofillKey[]) touched.add(key);
      apply(change);
    },
    tidy() {
      state = settleAutofill(state);
    },
    undo() {
      const plan = undoAutofill(state);
      state = plan.state;
      apply(plan.set);
    },
    get values() {
      return values;
    },
    get marks() {
      return filledFields(state);
    },
  };
}

const START: AutofillValues = {
  format: 'sides',
  sides: ['Yes', 'No'],
  pool: ['', '', ''],
  pickedIndex: null,
  stake: 5,
  close: { id: '1h', date: null },
  friends: [],
  opponentId: null,
};

describe('closeChoiceFor', () => {
  it('uses a fixed chip when the minutes match one', () => {
    expect(closeChoiceFor(30, now, offered)).toEqual({ id: '30m', date: null });
    expect(closeChoiceFor(24 * 60, now, offered)).toEqual({ id: '1d', date: null });
  });

  it('uses Tonight for 11:59 PM', () => {
    expect(closeChoiceFor(539, now, offered)).toEqual({ id: 'tonight', date: null });
  });

  it('picks a date otherwise', () => {
    expect(closeChoiceFor(120, now, offered)).toEqual({
      id: 'date',
      date: new Date(2026, 10, 14, 17, 0).toISOString(),
    });
  });
});

describe('planAutofill', () => {
  it('fills only what the question says, and marks it', () => {
    const f = form(START);
    expect(f.type('$20 it snows')).toEqual({ stake: 20 });
    expect(f.values).toMatchObject({ stake: 20, close: { id: '1h' }, friends: [] });
    expect([...f.marks.filled].sort()).toEqual(['format', 'sides', 'stake']);
    // Money on a bare statement: the yes / no is a guess
    expect([...f.marks.guessed]).toEqual(['sides']);
  });

  it('follows the text as it is typed', () => {
    const f = form(START);
    f.type('$1');
    expect(f.values.stake).toBe(1);
    f.type('$10');
    expect(f.values.stake).toBe(10);
  });

  it('puts a field back when the words go', () => {
    const f = form(START);
    f.type('$20 it snows tonight');
    expect(f.values).toMatchObject({ stake: 20, close: { id: 'tonight' } });
    f.type('it snows');
    expect(f.values).toMatchObject({ stake: 5, close: { id: '1h' } });
    expect(f.marks.filled.size).toBe(0);
  });

  it('never changes a field set by hand, before or after the text', () => {
    const f = form(START);
    f.byHand({ stake: 50 });
    f.type('$20 it snows');
    expect(f.values.stake).toBe(50);
    f.type('$25 it snows');
    expect(f.values.stake).toBe(50);
    expect(f.marks.filled.has('stake')).toBe(false);
  });

  it('does not put back a field changed by hand after it was filled', () => {
    const f = form(START);
    f.type('$20 it snows');
    f.byHand({ stake: 50 });
    f.type('it snows');
    expect(f.values.stake).toBe(50);
  });

  it('keeps what was filled once the question is tidied', () => {
    const f = form(START);
    f.type('$20 it snows tonight');
    f.tidy();
    // The tidied question no longer says $20
    f.type('It snows tonight');
    expect(f.values).toMatchObject({ stake: 20, close: { id: 'tonight' } });
    expect(f.marks.filled.has('stake')).toBe(true);
    // New words still fill
    f.type('It snows tonight, $30');
    expect(f.values.stake).toBe(30);
  });

  it('Undo fill puts every filled field back, and fills nothing more', () => {
    const f = form(START);
    f.type('bet Mike $20 it snows tonight');
    expect(f.values).toMatchObject({ format: 'challenge', opponentId: 'u-mike', stake: 20 });
    f.tidy();
    f.undo();
    expect(f.values).toEqual(START);
    expect(f.marks.filled.size).toBe(0);
    expect(f.type('$40 it snows')).toEqual({});
  });

  it('adds a named friend to the ones picked by hand, and takes back only that one', () => {
    const f = form({ ...START, friends: ['u-sara'] });
    f.type('it snows, invite Mike');
    expect(f.values.friends).toEqual(['u-mike', 'u-sara']);
    f.type('it snows');
    expect(f.values.friends).toEqual(['u-sara']);
  });

  it('turns a bet against one friend into a 1 v 1, and back', () => {
    const f = form(START);
    f.type('bet Mike it snows');
    expect(f.values).toMatchObject({ format: 'challenge', opponentId: 'u-mike', sides: ['Yes', 'No'] });
    f.type('it snows');
    expect(f.values).toMatchObject({ format: 'sides', opponentId: null });
  });

  it('fills a pool and leaves the sides alone', () => {
    const f = form(START);
    f.type('Who wins: Ana, Ben or Cal');
    expect(f.values).toMatchObject({ format: 'pool', pool: ['Ana', 'Ben', 'Cal'], sides: ['Yes', 'No'] });
  });

  it('changes nothing for a question with no clues', () => {
    const f = form(START);
    expect(f.type('Sam makes the early train')).toEqual({});
    expect(f.values).toEqual(START);
  });
});
