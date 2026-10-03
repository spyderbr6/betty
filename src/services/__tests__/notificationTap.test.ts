import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VAPID_PUBLIC_KEY } from '../../utils/webPushUtils';
import {
  NOTIFICATION_PARAM,
  SW_NOTIFICATION_CLICK,
  SW_SUBSCRIPTION_CHANGED,
  createTapRouter,
  pushDataFromUrl,
  tapFromPushData,
  withoutNotificationParam,
  type NotificationTap,
} from '../notificationTap';

const pushed = {
  notificationId: 'n-1',
  type: 'BET_JOINED',
  actionData: { betId: 'bet-1' },
  relatedBetId: 'bet-1',
};

describe('tapFromPushData', () => {
  it('reads the type and navigation data the dispatcher sends', () => {
    expect(tapFromPushData(pushed)).toEqual({
      type: 'BET_JOINED',
      data: {
        notificationId: 'n-1',
        actionType: undefined,
        actionData: { betId: 'bet-1' },
        relatedBetId: 'bet-1',
        relatedUserId: undefined,
      },
    });
  });

  it('routes nowhere for the test push or a payload without a type', () => {
    expect(tapFromPushData({ type: 'SYSTEM_ANNOUNCEMENT', test: true })).toBeNull();
    expect(tapFromPushData({ notificationId: 'n-1' })).toBeNull();
    expect(tapFromPushData(null)).toBeNull();
    expect(tapFromPushData('BET_JOINED')).toBeNull();
  });
});

describe('the ?notification= parameter', () => {
  const href = `https://app.example/?notification=${encodeURIComponent(JSON.stringify(pushed))}&x=1#top`;

  it('round-trips the push data the service worker encodes', () => {
    expect(pushDataFromUrl(href)).toEqual(pushed);
    expect(pushDataFromUrl('https://app.example/')).toBeNull();
    expect(pushDataFromUrl('https://app.example/?notification=%7Bnot-json')).toBeNull();
  });

  it('is removed, and only it, so a reload does not replay the tap', () => {
    expect(withoutNotificationParam(href)).toBe('/?x=1#top');
    expect(withoutNotificationParam('https://app.example/?notification=1')).toBe('/');
  });
});

describe('createTapRouter', () => {
  const tap = (id: string): NotificationTap => ({ type: 'BET_JOINED', data: { notificationId: id } });

  it('delivers straight away once a handler is registered', () => {
    const router = createTapRouter();
    const seen: string[] = [];
    router.setHandler((_type, data) => seen.push(data.notificationId!));
    router.open(tap('a'));
    expect(seen).toEqual(['a']);
  });

  it('holds a tap that arrives before the navigator, and delivers it on registration', () => {
    const router = createTapRouter();
    router.open(tap('early'));
    expect(router.hasPending()).toBe(true);

    const seen: string[] = [];
    router.setHandler((_type, data) => seen.push(data.notificationId!));
    expect(seen).toEqual(['early']);
    expect(router.hasPending()).toBe(false);
  });

  it('keeps only the latest early tap, and delivers it once', () => {
    const router = createTapRouter();
    router.open(tap('first'));
    router.open(tap('second'));
    const seen: string[] = [];
    router.setHandler((_type, data) => seen.push(data.notificationId!));
    router.setHandler((_type, data) => seen.push(data.notificationId!));
    expect(seen).toEqual(['second']);
  });

  it('holds taps again after the handler is removed (signed out)', () => {
    const router = createTapRouter();
    const seen: string[] = [];
    router.setHandler((_type, data) => seen.push(data.notificationId!));
    router.setHandler(null);
    router.open(tap('later'));
    expect(seen).toEqual([]);
    expect(router.hasPending()).toBe(true);
  });
});

describe('the service worker', () => {
  // public/service-worker.js is plain JS outside the bundle, so it repeats these values
  // rather than importing them. If they drift, clicks and renewals silently stop working.
  const worker = readFileSync(resolve(__dirname, '../../../public/service-worker.js'), 'utf8');
  const constant = (name: string) => worker.match(new RegExp(`const ${name} = '([^']+)'`))?.[1];

  it('speaks the same messages and parameter as the app', () => {
    expect(constant('NOTIFICATION_CLICK')).toBe(SW_NOTIFICATION_CLICK);
    expect(constant('SUBSCRIPTION_CHANGED')).toBe(SW_SUBSCRIPTION_CHANGED);
    expect(constant('NOTIFICATION_PARAM')).toBe(NOTIFICATION_PARAM);
  });

  it('renews subscriptions with the app’s VAPID key', () => {
    expect(constant('VAPID_PUBLIC_KEY')).toBe(VAPID_PUBLIC_KEY);
  });
});
