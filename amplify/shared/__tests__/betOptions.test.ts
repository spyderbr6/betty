import { describe, expect, it } from 'vitest';
import {
  betOptions,
  countField,
  isBetOption,
  isHeadToHead,
  isPool,
  optionCount,
  optionCounts,
  optionName,
  optionNames,
  parseOdds,
  participantCount,
} from '../betOptions';

const POOL = { sideAName: 'Chiefs', sideBName: 'Bills', options: ['Chiefs', 'Bills', 'Eagles', 'Lions'] };

describe('betOptions', () => {
  it('reads a two-sided bet as options A and B', () => {
    expect(betOptions({ sideAName: 'Yes', sideBName: 'No' })).toEqual([
      { key: 'A', name: 'Yes' },
      { key: 'B', name: 'No' },
    ]);
    expect(isPool({ sideAName: 'Yes', sideBName: 'No' })).toBe(false);
  });

  it('falls back to Side A and Side B when the names are missing', () => {
    expect(betOptions(null).map((o) => o.name)).toEqual(['Side A', 'Side B']);
    expect(betOptions({}).map((o) => o.name)).toEqual(['Side A', 'Side B']);
  });

  it('keys a pool\'s options A onwards, in order', () => {
    expect(betOptions(POOL).map((o) => `${o.key}:${o.name}`)).toEqual(['A:Chiefs', 'B:Bills', 'C:Eagles', 'D:Lions']);
    expect(isPool(POOL)).toBe(true);
  });

  it('reads a malformed options list as two sides, never as a pool', () => {
    for (const options of [['Only', 'Two'], ['1', '2', '3', '4', '5', '6', '7'], ['Chiefs', 'Bills', ''], ['Chiefs', 'Bills', 3], 'Chiefs']) {
      expect(betOptions({ sideAName: 'Chiefs', sideBName: 'Bills', options }).map((o) => o.key)).toEqual(['A', 'B']);
    }
  });
});

describe('isBetOption', () => {
  it('accepts only the keys the bet has', () => {
    expect(isBetOption(POOL, 'D')).toBe(true);
    expect(isBetOption(POOL, 'E')).toBe(false);
    expect(isBetOption({ sideAName: 'Yes', sideBName: 'No' }, 'C')).toBe(false);
    expect(isBetOption(POOL, 'a')).toBe(false);
    expect(isBetOption(POOL, undefined)).toBe(false);
  });
});

describe('names and counts', () => {
  it('names an option, and reads an unknown side as "Side X"', () => {
    expect(optionName(POOL, 'C')).toBe('Eagles');
    expect(optionName({ sideAName: 'Yes', sideBName: 'No' }, 'C')).toBe('Side C');
    expect(optionNames(POOL)).toEqual({ A: 'Chiefs', B: 'Bills', C: 'Eagles', D: 'Lions' });
  });

  it('maps an option to its count attribute, missing counts reading as 0', () => {
    expect(countField('A')).toBe('sideACount');
    expect(countField('F')).toBe('sideFCount');
    expect(optionCount({ sideACount: 2, sideCCount: 1, sideDCount: null }, 'C')).toBe(1);
    expect(optionCount({ sideACount: 2 }, 'D')).toBe(0);
  });
});

describe('participantCount and optionCounts', () => {
  it('adds up the counts of the options the bet has', () => {
    expect(participantCount({ sideACount: 2, sideBCount: 1 })).toBe(3);
    expect(participantCount({ odds: POOL, sideACount: 2, sideBCount: 1, sideCCount: 4, sideDCount: null })).toBe(7);
    // A count on an option the bet does not have is not a participant of it
    expect(participantCount({ sideACount: 1, sideBCount: 1, sideCCount: 5 })).toBe(2);
  });

  it('copies every count from a raw row, missing ones as 0', () => {
    expect(optionCounts({ sideACount: 2, sideCCount: 1, sideDCount: null })).toEqual({
      sideACount: 2,
      sideBCount: 0,
      sideCCount: 1,
      sideDCount: 0,
      sideECount: 0,
      sideFCount: 0,
    });
  });
});

describe('parseOdds', () => {
  it('reads an object, JSON text, or JSON text encoded twice', () => {
    const odds = { sideAName: 'Yes', sideBName: 'No' };
    expect(parseOdds(odds)).toEqual(odds);
    expect(parseOdds(JSON.stringify(odds))).toEqual(odds);
    expect(parseOdds(JSON.stringify(JSON.stringify(odds)))).toEqual(odds);
  });

  it('reads anything else as no odds, which is two unnamed sides', () => {
    for (const value of [null, undefined, 'not json', 7, ['Yes', 'No']]) {
      expect(parseOdds(value)).toEqual({});
    }
    expect(betOptions(parseOdds('not json')).map((o) => o.name)).toEqual(['Side A', 'Side B']);
  });
});

describe('isHeadToHead', () => {
  it('is a bet capped at two', () => {
    expect(isHeadToHead({ maxParticipants: 2 })).toBe(true);
    expect(isHeadToHead({ maxParticipants: null })).toBe(false);
    expect(isHeadToHead({})).toBe(false);
    expect(isHeadToHead(null)).toBe(false);
  });
});
