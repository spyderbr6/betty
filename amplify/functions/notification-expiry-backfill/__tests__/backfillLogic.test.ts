import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION_DAYS, planExpiry } from '../backfillLogic';

const NOW = new Date('2026-10-04T12:00:00Z');
const seconds = (iso: string) => Date.parse(iso) / 1000;
const days = (n: number) => n * 24 * 60 * 60;

describe('planExpiry', () => {
  it('expires a row its category’s retention after it was created, and fills in the category', () => {
    expect(planExpiry({ type: 'FRIEND_REQUEST_RECEIVED', createdAt: '2026-09-01T00:00:00Z' }, NOW)).toEqual({
      expiresAt: seconds('2026-09-01T00:00:00Z') + days(90),
      category: 'FRIENDS',
      alreadyExpired: false,
    });
  });

  it('keeps money, results and refunds for 180 days', () => {
    const plan = planExpiry({ type: 'DEPOSIT_COMPLETED', createdAt: '2026-06-01T00:00:00Z' }, NOW);
    expect(plan.expiresAt).toBe(seconds('2026-06-01T00:00:00Z') + days(180));
    expect(plan.alreadyExpired).toBe(false);
  });

  it('gives rows already past retention an expiry in the past, so TTL removes them', () => {
    const plan = planExpiry({ type: 'BET_JOINED', createdAt: '2026-01-01T00:00:00Z' }, NOW);
    expect(plan.expiresAt).toBe(seconds('2026-01-01T00:00:00Z') + days(90));
    expect(plan.alreadyExpired).toBe(true);
  });

  it('leaves an existing category alone', () => {
    expect(
      planExpiry({ type: 'BET_JOINED', category: 'MY_BET_ACTIVITY', createdAt: '2026-09-01T00:00:00Z' }, NOW).category
    ).toBeUndefined();
  });

  it('uses the default retention, and no category, for a type the catalog does not know', () => {
    expect(planExpiry({ type: 'BET_WON', createdAt: '2026-09-01T00:00:00Z' }, NOW)).toEqual({
      expiresAt: seconds('2026-09-01T00:00:00Z') + days(DEFAULT_RETENTION_DAYS),
      category: undefined,
      alreadyExpired: false,
    });
  });

  it('treats a row with no usable creation time as created now rather than deleting it', () => {
    for (const createdAt of [undefined, null, 'not a date', 12345]) {
      const plan = planExpiry({ type: 'BET_JOINED', createdAt }, NOW);
      expect(plan.expiresAt).toBe(NOW.getTime() / 1000 + days(90));
      expect(plan.alreadyExpired).toBe(false);
    }
  });
});
