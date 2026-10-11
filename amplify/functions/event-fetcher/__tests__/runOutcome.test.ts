import { describe, expect, it } from 'vitest';
import { fetcherRunError } from '../runOutcome';

describe('fetcherRunError', () => {
  it('passes a run where every request answered', () => {
    expect(fetcherRunError([
      { league: 'NBA', requests: 3, failed: 0 },
      { league: 'NFL', requests: 3, failed: 0 },
    ], 0)).toBeNull();
  });

  it('fails the run ESPN refused entirely (the September outage)', () => {
    expect(fetcherRunError([
      { league: 'NBA', requests: 3, failed: 3 },
      { league: 'NFL', requests: 3, failed: 3 },
    ], 0)).toBe('Event fetcher run failed: every ESPN request failed for NBA (3), NFL (3)');
  });

  it('fails when one league goes dark while the other answers', () => {
    expect(fetcherRunError([
      { league: 'NBA', requests: 3, failed: 0 },
      { league: 'NFL', requests: 3, failed: 3 },
    ], 0)).toMatch(/for NFL \(3\)$/);
  });

  it('leaves one failed day to the next run', () => {
    expect(fetcherRunError([
      { league: 'NBA', requests: 3, failed: 1 },
      { league: 'NFL', requests: 3, failed: 2 },
    ], 0)).toBeNull();
  });

  it('fails on any failed write', () => {
    expect(fetcherRunError([{ league: 'NBA', requests: 3, failed: 0 }], 1)).toBe('Event fetcher run failed: 1 event write failed');
    expect(fetcherRunError([{ league: 'NBA', requests: 3, failed: 3 }], 2)).toBe(
      'Event fetcher run failed: every ESPN request failed for NBA (3); 2 event writes failed'
    );
  });

  it('does not count a league with no requests as dark', () => {
    expect(fetcherRunError([{ league: 'NBA', requests: 0, failed: 0 }], 0)).toBeNull();
  });
});
