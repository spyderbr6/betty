import { describe, expect, it } from 'vitest';
import { describeLastSeen, formatMinuteOfDay, stepMinuteOfDay } from '../notificationSettingsFormat';

describe('formatMinuteOfDay', () => {
  it.each([
    [0, '12:00 AM'],
    [30, '12:30 AM'],
    [7 * 60, '7:00 AM'],
    [12 * 60 + 30, '12:30 PM'],
    [22 * 60, '10:00 PM'],
    [23 * 60 + 59, '11:59 PM'],
  ])('%i → %s', (minute, text) => {
    expect(formatMinuteOfDay(minute)).toBe(text);
  });
});

describe('stepMinuteOfDay', () => {
  it('steps and wraps around midnight in both directions', () => {
    expect(stepMinuteOfDay(22 * 60, 30)).toBe(22 * 60 + 30);
    expect(stepMinuteOfDay(23 * 60 + 30, 30)).toBe(0);
    expect(stepMinuteOfDay(0, -30)).toBe(23 * 60 + 30);
  });
});

describe('describeLastSeen', () => {
  const now = new Date(2026, 9, 1, 15, 0); // 1 Oct 2026, local time

  it('describes recent days relative to today', () => {
    expect(describeLastSeen(new Date(2026, 9, 1, 8, 0).toISOString(), now)).toBe('Active today');
    expect(describeLastSeen(new Date(2026, 8, 30, 23, 0).toISOString(), now)).toBe('Active yesterday');
    expect(describeLastSeen(new Date(2026, 8, 26, 12, 0).toISOString(), now)).toBe('Active 5 days ago');
  });

  it('falls back to a date for anything a week or older', () => {
    expect(describeLastSeen(new Date(2026, 2, 3, 12, 0).toISOString(), now)).toBe('Active Mar 3');
  });

  it('copes with a missing or invalid timestamp', () => {
    expect(describeLastSeen(null, now)).toBe('Never active');
    expect(describeLastSeen('not a date', now)).toBe('Never active');
  });
});
