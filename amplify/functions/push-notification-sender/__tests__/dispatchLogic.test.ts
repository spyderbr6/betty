import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_PUSH_AGE_MS,
  chunk,
  decidePush,
  notificationFromImage,
  pushData,
  pushPresentation,
  pushPriority,
  unmarshall,
  unreadBadgeCount,
  webPushOptions,
  webPushPayload,
  type StreamNotification,
} from '../dispatchLogic';

const NOW = new Date('2026-10-03T15:30:00Z');

/** A NewImage as DynamoDB streams deliver it for a Notification row. */
const image = (over: Record<string, unknown> = {}) => ({
  id: { S: 'n-1' },
  userId: { S: 'user-1' },
  type: { S: 'BET_JOINED' },
  category: { S: 'MY_BET_ACTIVITY' },
  title: { S: 'Someone joined' },
  message: { S: 'Alex joined your bet' },
  isRead: { BOOL: false },
  priority: { S: 'MEDIUM' },
  relatedBetId: { S: 'bet-1' },
  actionData: { S: '{"betId":"bet-1"}' },
  expiresAt: { N: '1790000000' },
  createdAt: { S: '2026-10-03T15:29:00.000Z' },
  ...over,
});

const note = (over: Partial<StreamNotification> = {}): StreamNotification => ({
  ...(notificationFromImage(image()) as StreamNotification),
  ...over,
});

describe('unmarshall', () => {
  it('converts every attribute type a Notification row uses', () => {
    expect(
      unmarshall({
        s: { S: 'x' },
        n: { N: '42' },
        b: { BOOL: true },
        nul: { NULL: true },
        m: { M: { inner: { S: 'y' } } },
        l: { L: [{ S: 'a' }, { N: '1' }] },
        ss: { SS: ['p', 'q'] },
      })
    ).toEqual({ s: 'x', n: 42, b: true, nul: null, m: { inner: 'y' }, l: ['a', 1], ss: ['p', 'q'] });
  });

  it('handles a missing image', () => {
    expect(unmarshall(undefined)).toEqual({});
  });
});

describe('notificationFromImage', () => {
  it('reads the fields the dispatcher needs', () => {
    expect(notificationFromImage(image())).toEqual({
      id: 'n-1',
      userId: 'user-1',
      type: 'BET_JOINED',
      title: 'Someone joined',
      message: 'Alex joined your bet',
      priority: 'MEDIUM',
      actionType: undefined,
      actionData: '{"betId":"bet-1"}',
      relatedBetId: 'bet-1',
      relatedUserId: undefined,
      createdAt: '2026-10-03T15:29:00.000Z',
    });
  });

  it('rejects rows missing required fields or with an unknown type', () => {
    expect(notificationFromImage(image({ userId: { NULL: true } }))).toBeNull();
    expect(notificationFromImage(image({ title: { S: '' } }))).toBeNull();
    expect(notificationFromImage(image({ type: { S: 'NOT_A_TYPE' } }))).toBeNull();
  });
});

describe('decidePush', () => {
  it('pushes by default, including when the user has no preferences row', () => {
    expect(decidePush(note(), null, NOW)).toEqual({ push: true });
  });

  it('pushes notifications raised by Lambdas just the same — the reason this exists', () => {
    expect(decidePush(note({ type: 'BET_RESOLVED' }), null, NOW)).toEqual({ push: true });
    expect(decidePush(note({ type: 'SQUARES_PERIOD_WINNER' }), null, NOW)).toEqual({ push: true });
  });

  it('never pushes feed-only types', () => {
    expect(decidePush(note({ type: 'BET_INVITATION_DECLINED' }), null, NOW)).toEqual({
      push: false,
      reason: 'feed-only',
    });
  });

  it('respects a muted category, the push switch and quiet hours', () => {
    expect(decidePush(note(), { alertMutedCategories: ['MY_BET_ACTIVITY'] }, NOW)).toEqual({
      push: false,
      reason: 'preferences',
    });
    expect(decidePush(note(), { pushEnabled: false }, NOW)).toMatchObject({ push: false });
    // 15:30 UTC is 11:30 in New York: inside an 11:00–12:00 quiet window there.
    const quiet = {
      alertMutedCategories: [],
      quietHoursEnabled: true,
      quietStartMinute: 11 * 60,
      quietEndMinute: 12 * 60,
      timezone: 'America/New_York',
    };
    expect(decidePush(note(), quiet, NOW)).toMatchObject({ push: false, reason: 'preferences' });
    expect(decidePush(note(), { ...quiet, timezone: 'UTC' }, NOW)).toEqual({ push: true });
  });

  it('does not push a notification that has waited too long, e.g. after an outage', () => {
    const old = new Date(NOW.getTime() - MAX_PUSH_AGE_MS - 1000).toISOString();
    expect(decidePush(note({ createdAt: old }), null, NOW)).toEqual({ push: false, reason: 'stale' });
    const recent = new Date(NOW.getTime() - MAX_PUSH_AGE_MS + 1000).toISOString();
    expect(decidePush(note({ createdAt: recent }), null, NOW)).toEqual({ push: true });
  });
});

describe('payload helpers', () => {
  it('maps HIGH and URGENT to urgent delivery and everything else to normal', () => {
    expect(pushPriority('URGENT')).toBe('HIGH');
    expect(pushPriority('HIGH')).toBe('HIGH');
    expect(pushPriority('MEDIUM')).toBe('MEDIUM');
    expect(pushPriority(undefined)).toBe('MEDIUM');
    expect(webPushOptions('HIGH')).toEqual({ TTL: 86400, urgency: 'high' });
    expect(webPushOptions('MEDIUM')).toEqual({ TTL: 86400, urgency: 'normal' });
  });

  it('carries what the app needs to navigate on tap, with actionData as an object', () => {
    expect(pushData(note())).toEqual({
      notificationId: 'n-1',
      type: 'BET_JOINED',
      actionType: undefined,
      actionData: { betId: 'bet-1' },
      relatedBetId: 'bet-1',
      relatedUserId: undefined,
    });
    expect(pushData(note({ actionData: { betId: 'b' } })).actionData).toEqual({ betId: 'b' });
    expect(pushData(note({ actionData: 'not json' })).actionData).toBe('not json');
  });

  it('splits Expo sends into batches of at most 100', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    expect(chunk(items).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunk([])).toEqual([]);
  });
});

describe('pushPresentation', () => {
  it('sends each category to its own Android channel', () => {
    expect(pushPresentation({ type: 'DEPOSIT_COMPLETED' }).channelId).toBe('category-money');
    expect(pushPresentation({ type: 'FRIEND_REQUEST_RECEIVED' }).channelId).toBe('category-friends');
    expect(pushPresentation({ type: 'SQUARES_PERIOD_WINNER' }).channelId).toBe('category-results');
  });

  it('makes only the alerts that are useless late time-sensitive', () => {
    expect(pushPresentation({ type: 'SQUARES_GAME_LIVE' }).timeSensitive).toBe(true);
    expect(pushPresentation({ type: 'BET_DEADLINE_APPROACHING' }).timeSensitive).toBe(true);
    expect(pushPresentation({ type: 'BET_RESOLVED' }).timeSensitive).toBe(false);
    expect(pushPresentation({ type: 'DEPOSIT_COMPLETED' }).timeSensitive).toBe(false);
  });
});

describe('unreadBadgeCount', () => {
  const row = (type: string, isRead: boolean, category: string | null = null) => ({ type, isRead, category });

  it('counts unread notifications only', () => {
    expect(
      unreadBadgeCount([row('BET_JOINED', false), row('BET_JOINED', true), row('BET_RESOLVED', false)], null)
    ).toBe(2);
  });

  it('leaves out what the feed hides, so the badge can always be cleared', () => {
    const prefs = { feedMutedCategories: ['FRIENDS', 'MONEY'] };
    expect(
      unreadBadgeCount(
        [
          row('FRIEND_REQUEST_RECEIVED', false, 'FRIENDS'),
          // No stored category: taken from the type.
          row('FRIEND_REQUEST_ACCEPTED', false),
          // Locked in the feed, so counted even though it is "muted".
          row('DEPOSIT_COMPLETED', false, 'MONEY'),
          row('BET_JOINED', false, 'MY_BET_ACTIVITY'),
        ],
        prefs
      )
    ).toBe(2);
  });

  it('is zero with nothing to count', () => {
    expect(unreadBadgeCount([], null)).toBe(0);
    expect(unreadBadgeCount(null, null)).toBe(0);
  });
});

describe('webPushPayload', () => {
  it('tags by notification, so a redelivery replaces itself but two notifications both show', () => {
    const a = webPushPayload('T', 'B', { notificationId: 'n-1', type: 'BET_JOINED' }, 'MEDIUM');
    const b = webPushPayload('T', 'B', { notificationId: 'n-2', type: 'BET_JOINED' }, 'MEDIUM');
    expect(a.tag).toBe('sidebet-n-1');
    expect(b.tag).not.toBe(a.tag);
    expect(webPushPayload('T', 'B', { test: true }, 'HIGH').tag).toBe('sidebet-test');
  });

  it('points at icons the site actually serves', () => {
    const payload = webPushPayload('Title', 'Body', {}, 'HIGH');
    expect(payload).toMatchObject({ title: 'Title', body: 'Body', priority: 'HIGH' });
    for (const path of [payload.icon, payload.badge] as string[]) {
      // Served from public/, which expo export copies to the site root.
      expect(existsSync(resolve(__dirname, '../../../../public', path.slice(1))), path).toBe(true);
    }
  });
});
