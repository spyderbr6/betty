import { describe, expect, it } from 'vitest';
import { joinMessage, parseJoinResult } from '../joinBetLogic';

describe('parseJoinResult', () => {
  it('reads the answer as an object, as JSON text, or as JSON text encoded twice', () => {
    const joined = { status: 'joined', participantId: 'b#u', amount: 25, balance: 225 };
    expect(parseJoinResult(joined)).toEqual(joined);
    expect(parseJoinResult(JSON.stringify(joined))).toEqual(joined);
    expect(parseJoinResult(JSON.stringify(JSON.stringify(joined)))).toEqual(joined);
  });

  it('treats anything else as no answer', () => {
    expect(parseJoinResult(null)).toBeNull();
    expect(parseJoinResult('not json')).toBeNull();
    expect(parseJoinResult({ status: 'maybe' })).toBeNull();
  });
});

describe('joinMessage', () => {
  it('quotes the balance after the stake on success', () => {
    expect(joinMessage({ status: 'joined', participantId: 'p', amount: 25, balance: 225 }, 25)).toEqual({
      title: 'Joined Successfully!',
      message: "You've joined the bet with $25. Your new balance is $225.00.",
    });
  });

  it('states the stake and the balance when the balance is short', () => {
    const msg = joinMessage({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 5, required: 25 }, 25);
    expect(msg.title).toBe('Insufficient Balance');
    expect(msg.message).toContain('You need $25');
    expect(msg.message).toContain('$5.00');
  });

  it('explains each refusal rather than a generic failure', () => {
    expect(joinMessage({ status: 'refused', reason: 'ALREADY_JOINED' }, 25).title).toBe('Already Joined');
    expect(joinMessage({ status: 'refused', reason: 'EXPIRED' }, 25).title).toBe('Bet Closed');
    expect(joinMessage({ status: 'refused', reason: 'NOT_OPEN' }, 25).title).toBe('Bet Not Available');
    expect(joinMessage({ status: 'refused', reason: 'NOT_INVITED' }, 25).title).toBe('Invitation Required');
    expect(joinMessage({ status: 'refused', reason: 'AMOUNT_CHANGED' }, 25).title).toBe('Stake Changed');
  });

  it('falls back to a plain error when the call failed', () => {
    expect(joinMessage(null, 25)).toEqual({ title: 'Error', message: 'Failed to join bet. Please try again.' });
  });
});
