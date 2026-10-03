/**
 * Pure logic for the one-off notification expiry backfill. Kept out of the handler so it
 * can be tested (see push-notification-sender/pushLogic.ts for why handlers cannot be).
 *
 * Notifications written before Phase 1 have no `expiresAt`, so DynamoDB TTL never removes
 * them. This gives each one the expiry it would have had: its creation time plus its
 * category's retention. Rows already past that get an expiry in the past, and TTL deletes
 * them within about two days. See docs/NOTIFICATIONS_PLAN.md §3.7.
 */

import {
  NOTIFICATION_CATALOG,
  notificationMeta,
  type NotificationCategory,
  type NotificationType,
} from '../../shared/notificationCatalog';

/** Retention for rows whose type the catalog doesn't know: the shortest category's. */
export const DEFAULT_RETENTION_DAYS = 90;

export interface BackfillRow {
  type?: unknown;
  createdAt?: unknown;
  category?: unknown;
}

export interface ExpiryPlan {
  /** Epoch seconds, as DynamoDB TTL reads it. */
  expiresAt: number;
  /** Set only when the row has no category yet and its type is known. */
  category?: NotificationCategory;
  /** The expiry has already passed: TTL will delete the row once this is written. */
  alreadyExpired: boolean;
}

export function planExpiry(row: BackfillRow, now: Date): ExpiryPlan {
  const parsed = typeof row.createdAt === 'string' ? Date.parse(row.createdAt) : NaN;
  // A row with no usable creation time is treated as created now: it gets the full
  // retention period rather than being deleted on a guess.
  const created = Number.isNaN(parsed) ? now : new Date(parsed);

  const known = typeof row.type === 'string' && row.type in NOTIFICATION_CATALOG;
  let expiresAt: number;
  let category: NotificationCategory | undefined;
  if (known) {
    ({ expiresAt, category } = notificationMeta(row.type as NotificationType, created));
  } else {
    expiresAt = Math.floor(created.getTime() / 1000) + DEFAULT_RETENTION_DAYS * 24 * 60 * 60;
  }

  const hasCategory = typeof row.category === 'string' && row.category.length > 0;
  return {
    expiresAt,
    category: hasCategory ? undefined : category,
    alreadyExpired: expiresAt <= Math.floor(now.getTime() / 1000),
  };
}
