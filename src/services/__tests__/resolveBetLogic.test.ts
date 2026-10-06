import { describe, expect, it } from 'vitest';
import { parseResolveResult, resolveMessage } from '../resolveBetLogic';

const resolved = { status: 'resolved', winningSide: 'A', disputeWindowEndsAt: '2026-10-07T12:00:00.000Z', winners: 1, refundedNoWinners: false } as const;

describe('parseResolveResult', () => {
  it('reads the answer as an object or JSON text, and nothing else', () => {
    expect(parseResolveResult(resolved)).toEqual(resolved);
    expect(parseResolveResult(JSON.stringify(resolved))).toEqual(resolved);
    expect(parseResolveResult('x')).toBeNull();
    expect(parseResolveResult({ status: 'other' })).toBeNull();
  });
});

describe('resolveMessage', () => {
  it('names the winner and the 48-hour window on success', () => {
    const msg = resolveMessage(resolved, 'Chiefs');
    expect(msg.title).toBe('Bet Resolved');
    expect(msg.message).toContain('Winner: Chiefs');
    expect(msg.message).toContain('48-hour dispute window');
  });

  it('says the stakes come back when nobody backed the winner', () => {
    expect(resolveMessage({ ...resolved, winners: 0, refundedNoWinners: true }, 'Chiefs').message).toContain('every stake will be returned');
  });

  it('explains a refusal', () => {
    expect(resolveMessage({ status: 'refused', reason: 'NOT_RESOLVABLE' }, 'Chiefs').title).toBe('Already Resolved');
    expect(resolveMessage({ status: 'refused', reason: 'NOT_CREATOR' }, 'Chiefs').title).toBe('Not Your Bet');
    expect(resolveMessage({ status: 'refused', reason: 'BUSY' }, 'Chiefs').title).toBe('Bet Changed');
  });

  it('falls back to a plain error when the call failed', () => {
    expect(resolveMessage(null, 'Chiefs')).toEqual({ title: 'Error', message: 'Failed to resolve bet. Please try again.' });
  });
});
