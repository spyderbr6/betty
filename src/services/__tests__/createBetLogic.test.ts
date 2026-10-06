import { describe, expect, it } from 'vitest';
import { createBetProblem, newBetId, parseCreateBetResult } from '../createBetLogic';

describe('newBetId', () => {
  it('makes v4 UUIDs, a new one each time', () => {
    const a = newBetId();
    const b = newBetId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('parseCreateBetResult', () => {
  it('reads the answer as an object or JSON text', () => {
    const created = { status: 'created', betId: 'b', balance: 75 };
    expect(parseCreateBetResult(created)).toEqual(created);
    expect(parseCreateBetResult(JSON.stringify(created))).toEqual(created);
    expect(parseCreateBetResult('nope')).toBeNull();
    expect(parseCreateBetResult(null)).toBeNull();
  });
});

describe('createBetProblem', () => {
  it('has nothing to say when the bet was created', () => {
    expect(createBetProblem({ status: 'created', betId: 'b', balance: 75 }, 25)).toBeNull();
  });

  it('states the stake and the balance when the balance is short', () => {
    expect(createBetProblem({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 5, required: 25 }, 25)).toEqual({
      title: 'Insufficient Funds',
      message: 'You need $25.00 to create this bet, but you only have $5.00. Please add funds to your account.',
    });
  });

  it('names the field the server refused', () => {
    expect(createBetProblem({ status: 'refused', reason: 'INVALID', field: 'deadlineMinutes' }, 25)?.message).toContain('the deadline');
  });

  it('falls back to a plain error for a failed call or an unexpected refusal', () => {
    expect(createBetProblem(null, 25)?.title).toBe('Error');
    expect(createBetProblem({ status: 'refused', reason: 'INVALID', field: 'betId' }, 25)?.title).toBe('Error');
  });
});
