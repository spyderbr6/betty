import { describe, expect, it } from 'vitest';
import {
  autofillValues,
  closeChoiceFor,
  EMPTY_AUTOFILL,
  planAutofill,
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
  return {
    type(text: string) {
      const next = autofillValues(parseBetText(text, { now, friends }), {
        now,
        closeOptions: offered,
        state,
        current: values,
      });
      const plan = planAutofill(state, next, values);
      state = plan.state;
      values = { ...values, ...plan.set };
      return plan.set;
    },
    byHand(change: AutofillValues) {
      values = { ...values, ...change };
    },
    get values() {
      return values;
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
  it('fills only what the question says', () => {
    const f = form(START);
    expect(f.type('$20 it snows')).toEqual({ stake: 20 });
    expect(f.values).toMatchObject({ stake: 20, close: { id: '1h' }, friends: [] });
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
  });

  it('keeps a field changed by hand while the text says the same', () => {
    const f = form(START);
    f.type('$20 it snows');
    f.byHand({ stake: 50 });
    f.type('$20 it snows a lot');
    expect(f.values.stake).toBe(50);
  });

  it('does not put back a field changed by hand when the words go', () => {
    const f = form(START);
    f.type('$20 it snows');
    f.byHand({ stake: 50 });
    f.type('it snows');
    expect(f.values.stake).toBe(50);
  });

  it('lets new words win over a field changed by hand', () => {
    const f = form(START);
    f.type('$20 it snows');
    f.byHand({ stake: 50 });
    f.type('$25 it snows');
    expect(f.values.stake).toBe(25);
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
    expect(f.type('Sam makes the 8:15 train')).toEqual({});
    expect(f.values).toEqual(START);
  });
});
