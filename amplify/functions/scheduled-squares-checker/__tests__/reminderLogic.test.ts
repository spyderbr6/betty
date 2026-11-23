import { describe, expect, it } from 'vitest';
import { invitationsToRemind, isInReminderWindow, REMINDER_LEAD_MINUTES, timeLeftText } from '../reminderLogic';

const now = new Date('2026-11-22T18:00:00.000Z');
const minutesFromNow = (m: number) => new Date(now.getTime() + m * 60_000).toISOString();

const game = (fields: Record<string, unknown> = {}) => ({
  status: 'ACTIVE',
  creatorId: 'creator',
  locksAt: minutesFromNow(30),
  squaresSold: 10,
  ...fields,
});

const invite = (id: string, toUserId: string, status = 'PENDING') => ({ id, toUserId, status });

describe('isInReminderWindow', () => {
  it('is open from the lead time before the lock until the lock', () => {
    expect(isInReminderWindow(game({ locksAt: minutesFromNow(REMINDER_LEAD_MINUTES) }), now)).toBe(true);
    expect(isInReminderWindow(game({ locksAt: minutesFromNow(1) }), now)).toBe(true);
    expect(isInReminderWindow(game({ locksAt: minutesFromNow(REMINDER_LEAD_MINUTES + 1) }), now)).toBe(false);
    expect(isInReminderWindow(game({ locksAt: minutesFromNow(0) }), now)).toBe(false);
    expect(isInReminderWindow(game({ locksAt: minutesFromNow(-5) }), now)).toBe(false);
  });

  it('skips games that are no longer open, full, or have no lock time', () => {
    expect(isInReminderWindow(game({ status: 'LOCKED' }), now)).toBe(false);
    expect(isInReminderWindow(game({ squaresSold: 100 }), now)).toBe(false);
    expect(isInReminderWindow(game({ locksAt: null }), now)).toBe(false);
    expect(isInReminderWindow(game({ locksAt: 'not a date' }), now)).toBe(false);
  });
});

describe('invitationsToRemind', () => {
  it('reminds pending invitees who have bought nothing', () => {
    const due = invitationsToRemind(
      game(),
      [invite('i-1', 'ann'), invite('i-2', 'bob'), invite('i-3', 'cat', 'DECLINED'), invite('i-4', 'dan', 'ACCEPTED')],
      [{ userId: 'bob' }],
      now
    );
    expect(due.map((i) => i.id)).toEqual(['i-1']);
  });

  it('never reminds the creator, and reminds each invitee once', () => {
    const due = invitationsToRemind(game(), [invite('i-1', 'creator'), invite('i-2', 'ann'), invite('i-3', 'ann')], [], now);
    expect(due.map((i) => i.id)).toEqual(['i-2']);
  });

  it('reminds nobody outside the window', () => {
    expect(invitationsToRemind(game({ locksAt: minutesFromNow(120) }), [invite('i-1', 'ann')], [], now)).toEqual([]);
  });
});

describe('timeLeftText', () => {
  it('rounds up to whole minutes, never below one', () => {
    expect(timeLeftText(minutesFromNow(45), now)).toBe('45 minutes');
    expect(timeLeftText(new Date(now.getTime() + 30_000).toISOString(), now)).toBe('1 minute');
    expect(timeLeftText(new Date(now.getTime() + 61_000).toISOString(), now)).toBe('2 minutes');
  });
});
