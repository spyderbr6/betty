import { describe, expect, it } from 'vitest';
import {
  isFeedVisible,
  isInQuietHours,
  localMinuteOfDay,
  resolvePreferences,
  setMuted,
  shouldAlert,
  toStoredPreferences,
  type ResolvedPreferences,
} from '../notificationPreferencesLogic';

const prefs = (over: Partial<ResolvedPreferences> = {}): ResolvedPreferences => ({
  ...resolvePreferences(null),
  ...over,
});

// 2026-10-01 15:30 UTC = 11:30 in New York (EDT, UTC-4).
const NOON_ISH_UTC = new Date('2026-10-01T15:30:00Z');

describe('resolvePreferences', () => {
  it('mutes nothing for a missing row', () => {
    expect(resolvePreferences(null)).toEqual({
      pushEnabled: true,
      inAppEnabled: true,
      alertMuted: [],
      feedMuted: [],
      quietHoursEnabled: false,
      quietStartMinute: null,
      quietEndMinute: null,
      timezone: null,
    });
  });

  it('carries legacy switches over as alert and feed mutes', () => {
    const resolved = resolvePreferences({
      friendRequestsEnabled: false,
      betJoinedEnabled: false,
      paymentNotificationsEnabled: false,
      betResolvedEnabled: true,
    });
    expect(resolved.alertMuted).toEqual(['FRIENDS', 'MY_BET_ACTIVITY', 'SQUARES_UPDATES', 'MONEY']);
    expect(resolved.feedMuted).toEqual(resolved.alertMuted);
  });

  it('never treats a missing legacy switch as off', () => {
    expect(resolvePreferences({ friendRequestsEnabled: null }).alertMuted).toEqual([]);
  });

  it('uses the new lists once written, even when empty, and ignores the legacy switches', () => {
    const resolved = resolvePreferences({
      friendRequestsEnabled: false,
      alertMutedCategories: [],
      feedMutedCategories: ['REMINDERS'],
    });
    expect(resolved.alertMuted).toEqual([]);
    expect(resolved.feedMuted).toEqual(['REMINDERS']);
  });

  it('drops unknown and duplicate categories', () => {
    expect(
      resolvePreferences({ alertMutedCategories: ['MONEY', 'NOT_A_CATEGORY', null, 'MONEY', 'FRIENDS'] }).alertMuted
    ).toEqual(['FRIENDS', 'MONEY']);
  });

  it('prefers minute quiet hours, falling back to the legacy hours', () => {
    expect(resolvePreferences({ dndStartHour: 22, dndEndHour: 7 })).toMatchObject({
      quietStartMinute: 1320,
      quietEndMinute: 420,
    });
    expect(
      resolvePreferences({ dndStartHour: 22, dndEndHour: 7, quietStartMinute: 1350, quietEndMinute: 390 })
    ).toMatchObject({ quietStartMinute: 1350, quietEndMinute: 390 });
  });

  it('round-trips through toStoredPreferences, which always writes both lists', () => {
    const legacy = resolvePreferences({ friendRequestsEnabled: false, dndEnabled: true, dndStartHour: 0, dndEndHour: 6 });
    const stored = toStoredPreferences(legacy);
    expect(stored.alertMutedCategories).toEqual(['FRIENDS']);
    expect(stored.feedMutedCategories).toEqual(['FRIENDS']);
    expect(resolvePreferences({ ...stored, timezone: null })).toEqual(legacy);
  });
});

describe('setMuted', () => {
  it('adds and removes a category, keeping catalog order and no duplicates', () => {
    expect(setMuted(['MONEY'], 'FRIENDS', true)).toEqual(['FRIENDS', 'MONEY']);
    expect(setMuted(['FRIENDS', 'MONEY'], 'FRIENDS', true)).toEqual(['FRIENDS', 'MONEY']);
    expect(setMuted(['FRIENDS', 'MONEY'], 'FRIENDS', false)).toEqual(['MONEY']);
  });
});

describe('quiet hours', () => {
  it('reads the clock in the user’s timezone', () => {
    expect(localMinuteOfDay(NOON_ISH_UTC, 'America/New_York')).toBe(11 * 60 + 30);
    expect(localMinuteOfDay(NOON_ISH_UTC, 'UTC')).toBe(15 * 60 + 30);
  });

  it('falls back to the runtime clock for an unknown zone rather than throwing', () => {
    const expected = NOON_ISH_UTC.getHours() * 60 + NOON_ISH_UTC.getMinutes();
    expect(localMinuteOfDay(NOON_ISH_UTC, 'Not/AZone')).toBe(expected);
  });

  it('applies a same-day window in local time', () => {
    const p = prefs({ quietHoursEnabled: true, quietStartMinute: 11 * 60, quietEndMinute: 12 * 60, timezone: 'America/New_York' });
    expect(isInQuietHours(p, NOON_ISH_UTC)).toBe(true);
    // The same instant is 15:30 in UTC, outside the window.
    expect(isInQuietHours({ ...p, timezone: 'UTC' }, NOON_ISH_UTC)).toBe(false);
  });

  it('applies a window that wraps midnight', () => {
    const p = prefs({ quietHoursEnabled: true, quietStartMinute: 22 * 60, quietEndMinute: 7 * 60, timezone: 'UTC' });
    expect(isInQuietHours(p, new Date('2026-10-01T23:00:00Z'))).toBe(true);
    expect(isInQuietHours(p, new Date('2026-10-01T03:00:00Z'))).toBe(true);
    expect(isInQuietHours(p, new Date('2026-10-01T07:00:00Z'))).toBe(false);
    expect(isInQuietHours(p, new Date('2026-10-01T12:00:00Z'))).toBe(false);
  });

  it('handles daylight saving: 07:30 New York is 11:30 UTC in summer and 12:30 UTC in winter', () => {
    const p = prefs({ quietHoursEnabled: true, quietStartMinute: 7 * 60, quietEndMinute: 8 * 60, timezone: 'America/New_York' });
    expect(isInQuietHours(p, new Date('2026-07-01T11:30:00Z'))).toBe(true);
    expect(isInQuietHours(p, new Date('2026-12-01T12:30:00Z'))).toBe(true);
    expect(isInQuietHours(p, new Date('2026-12-01T11:30:00Z'))).toBe(false);
  });

  it('is off when disabled or incomplete', () => {
    expect(isInQuietHours(prefs({ quietHoursEnabled: false, quietStartMinute: 0, quietEndMinute: 0 }), NOON_ISH_UTC)).toBe(false);
    expect(isInQuietHours(prefs({ quietHoursEnabled: true, quietStartMinute: 0, quietEndMinute: null }), NOON_ISH_UTC)).toBe(false);
  });
});

describe('shouldAlert', () => {
  it('alerts by default on both channels', () => {
    expect(shouldAlert('FRIEND_REQUEST_RECEIVED', prefs(), 'push')).toBe(true);
    expect(shouldAlert('FRIEND_REQUEST_RECEIVED', prefs(), 'banner')).toBe(true);
  });

  it('never alerts for feed-only types', () => {
    expect(shouldAlert('BET_INVITATION_DECLINED', prefs(), 'push')).toBe(false);
    expect(shouldAlert('BET_INVITATION_DECLINED', prefs(), 'banner')).toBe(false);
  });

  it('lets every category be muted, including feed-locked ones', () => {
    const p = prefs({ alertMuted: ['MONEY'] });
    expect(shouldAlert('DEPOSIT_COMPLETED', p, 'push')).toBe(false);
    expect(shouldAlert('DEPOSIT_COMPLETED', p, 'banner')).toBe(false);
    expect(shouldAlert('FRIEND_REQUEST_RECEIVED', p, 'push')).toBe(true);
  });

  it('respects each channel’s master switch independently', () => {
    expect(shouldAlert('BET_JOINED', prefs({ pushEnabled: false }), 'push')).toBe(false);
    expect(shouldAlert('BET_JOINED', prefs({ pushEnabled: false }), 'banner')).toBe(true);
    expect(shouldAlert('BET_JOINED', prefs({ inAppEnabled: false }), 'banner')).toBe(false);
    expect(shouldAlert('BET_JOINED', prefs({ inAppEnabled: false }), 'push')).toBe(true);
  });

  it('holds push, but not banners, during quiet hours', () => {
    const quiet = prefs({ quietHoursEnabled: true, quietStartMinute: 0, quietEndMinute: 0, timezone: 'UTC' });
    expect(shouldAlert('BET_JOINED', quiet, 'push', NOON_ISH_UTC)).toBe(false);
    expect(shouldAlert('BET_JOINED', quiet, 'banner', NOON_ISH_UTC)).toBe(true);
  });
});

describe('isFeedVisible', () => {
  const muted = prefs({ feedMuted: ['FRIENDS', 'MONEY'] });

  it('hides a feed-muted category', () => {
    expect(isFeedVisible({ type: 'FRIEND_REQUEST_RECEIVED', category: 'FRIENDS' }, muted)).toBe(false);
  });

  it('always shows feed-locked categories, even if muted', () => {
    expect(isFeedVisible({ type: 'DEPOSIT_COMPLETED', category: 'MONEY' }, muted)).toBe(true);
  });

  it('derives the category from the type for rows written before categories existed', () => {
    expect(isFeedVisible({ type: 'FRIEND_REQUEST_ACCEPTED', category: null }, muted)).toBe(false);
    expect(isFeedVisible({ type: 'BET_JOINED' }, muted)).toBe(true);
  });

  it('shows unknown types rather than hiding them', () => {
    expect(isFeedVisible({ type: 'SOMETHING_NEW' }, muted)).toBe(true);
  });
});
