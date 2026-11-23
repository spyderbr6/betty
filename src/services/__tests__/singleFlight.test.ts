import { describe, expect, it } from 'vitest';
import { singleFlight } from '../singleFlight';

/** A call that finishes when told to, counting how many were started. */
function gate() {
  let started = 0;
  const releases: Array<(v: string) => void> = [];
  return {
    start: () => {
      started++;
      return new Promise<string>((resolve) => releases.push(resolve));
    },
    release: (v: string) => releases.shift()?.(v),
    started: () => started,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('singleFlight', () => {
  it('runs calls made together for one key once, and gives each the result', async () => {
    const run = singleFlight<string>();
    const g = gate();
    const calls = [run('user-1', false, g.start), run('user-1', false, g.start), run('user-1', false, g.start), run('user-1', false, g.start)];
    await tick();
    expect(g.started()).toBe(1);
    g.release('token');
    expect(await Promise.all(calls)).toEqual(['token', 'token', 'token', 'token']);
  });

  it('starts again once the call under way has finished', async () => {
    const run = singleFlight<string>();
    const g = gate();
    const first = run('user-1', false, g.start);
    await tick();
    g.release('a');
    await first;
    const second = run('user-1', false, g.start);
    await tick();
    expect(g.started()).toBe(2);
    g.release('b');
    expect(await second).toBe('b');
  });

  it('does not join a call for another key', async () => {
    const run = singleFlight<string>();
    const g = gate();
    void run('user-1', false, g.start);
    void run('user-2', false, g.start);
    await tick();
    expect(g.started()).toBe(2);
  });

  it('runs a forced call after the one under way, not alongside it', async () => {
    const run = singleFlight<string>();
    const g = gate();
    const first = run('user-1', false, g.start);
    const forced = run('user-1', true, g.start);
    await tick();
    expect(g.started()).toBe(1);
    g.release('first');
    await first;
    await tick();
    expect(g.started()).toBe(2);
    g.release('forced');
    expect(await forced).toBe('forced');
  });

  it('lets the next call start after one fails', async () => {
    const run = singleFlight<string>();
    await expect(run('user-1', false, () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await run('user-1', false, () => Promise.resolve('ok'))).toBe('ok');
  });
});
