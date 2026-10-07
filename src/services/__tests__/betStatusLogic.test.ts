import { describe, expect, it } from 'vitest';
import { endEarlyProblem, fileDisputeProblem, parseStatusResult, type EndEarlyResult } from '../betStatusLogic';

describe('parseStatusResult', () => {
  it('reads an object, JSON text, or JSON text encoded twice', () => {
    const ended = { status: 'ended' };
    expect(parseStatusResult<EndEarlyResult>(ended, ['ended', 'refused'])).toEqual(ended);
    expect(parseStatusResult<EndEarlyResult>(JSON.stringify(ended), ['ended', 'refused'])).toEqual(ended);
    expect(parseStatusResult<EndEarlyResult>(JSON.stringify(JSON.stringify(ended)), ['ended', 'refused'])).toEqual(ended);
  });

  it('is null for anything else', () => {
    expect(parseStatusResult(null, ['ended'])).toBeNull();
    expect(parseStatusResult('not json', ['ended'])).toBeNull();
    expect(parseStatusResult({ status: 'other' }, ['ended'])).toBeNull();
  });
});

describe('messages', () => {
  it('says nothing when the bet ended or the dispute was filed', () => {
    expect(endEarlyProblem({ status: 'ended' })).toBeNull();
    expect(fileDisputeProblem({ status: 'filed', disputeId: 'd' })).toBeNull();
  });

  it('explains a refusal, and falls back for a failed call', () => {
    expect(endEarlyProblem({ status: 'refused', reason: 'NOT_ACTIVE' })).toBe('This bet has already ended.');
    expect(endEarlyProblem(null)).toBe('Failed to end bet. Please try again.');
    expect(fileDisputeProblem({ status: 'refused', reason: 'WINDOW_CLOSED' })).toBe('The dispute window for this bet has closed.');
    expect(fileDisputeProblem(null)).toBe('Failed to file dispute. Please try again.');
  });
});
