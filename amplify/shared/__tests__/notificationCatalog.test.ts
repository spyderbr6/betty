import { describe, expect, it } from 'vitest';
import {
  CATEGORY_INFO,
  NOTIFICATION_CATALOG,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  notificationMeta,
} from '../notificationCatalog';

describe('notification catalog', () => {
  it('catalogues every notification type exactly once, and nothing else', () => {
    expect(Object.keys(NOTIFICATION_CATALOG).sort()).toEqual([...NOTIFICATION_TYPES].sort());
    expect(new Set(NOTIFICATION_TYPES).size).toBe(NOTIFICATION_TYPES.length);
  });

  it('puts every type in a known category, and every category has at least one type', () => {
    const used = new Set(Object.values(NOTIFICATION_CATALOG).map((t) => t.category));
    for (const category of used) expect(NOTIFICATION_CATEGORIES).toContain(category);
    expect([...used].sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
    expect(Object.keys(CATEGORY_INFO).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
  });

  it('always shows money, results, refunds and disputes in the feed, and nothing else', () => {
    const locked = NOTIFICATION_CATEGORIES.filter((c) => CATEGORY_INFO[c].feedLocked);
    expect(locked.sort()).toEqual(['ACTION_NEEDED', 'MONEY', 'REFUNDS', 'RESULTS']);
  });

  it('files every payment type under MONEY', () => {
    for (const type of NOTIFICATION_TYPES) {
      if (/^(DEPOSIT|WITHDRAWAL|PAYMENT)_/.test(type)) {
        expect(NOTIFICATION_CATALOG[type].category).toBe('MONEY');
      }
    }
  });
});

describe('notificationMeta', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');
  const nowSeconds = now.getTime() / 1000;
  const days = (n: number) => n * 24 * 60 * 60;

  it('stamps the category and a 90-day expiry for ordinary types', () => {
    expect(notificationMeta('FRIEND_REQUEST_RECEIVED', now)).toEqual({
      category: 'FRIENDS',
      expiresAt: nowSeconds + days(90),
    });
  });

  it('keeps money and results for 180 days', () => {
    expect(notificationMeta('DEPOSIT_COMPLETED', now).expiresAt).toBe(nowSeconds + days(180));
    expect(notificationMeta('SQUARES_PERIOD_WINNER', now).expiresAt).toBe(nowSeconds + days(180));
  });

  it('expresses expiry in whole epoch seconds, the unit DynamoDB TTL reads', () => {
    const { expiresAt } = notificationMeta('BET_JOINED', new Date('2026-10-01T00:00:00.999Z'));
    expect(Number.isInteger(expiresAt)).toBe(true);
    expect(expiresAt).toBe(nowSeconds + days(90));
  });
});
