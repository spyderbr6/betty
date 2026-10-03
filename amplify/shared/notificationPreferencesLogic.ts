/**
 * How a user's notification preferences apply to a notification: whether it may alert
 * (push or in-app banner) and whether it shows in the feed.
 *
 * Shared by the app now and by the server-side dispatcher later (Phase 3), so both make
 * the same decision. Pure and dependency-free like the catalog. See
 * docs/NOTIFICATIONS_PLAN.md §3.3–3.5.
 */

import {
  CATEGORY_INFO,
  NOTIFICATION_CATALOG,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationType,
} from './notificationCatalog';

/** A NotificationPreferences row as stored. Any field may be missing; missing never mutes. */
export interface StoredPreferences {
  pushEnabled?: boolean | null;
  inAppEnabled?: boolean | null;
  alertMutedCategories?: (string | null)[] | null;
  feedMutedCategories?: (string | null)[] | null;
  quietHoursEnabled?: boolean | null;
  quietStartMinute?: number | null;
  quietEndMinute?: number | null;
  timezone?: string | null;
}

/** Preferences in the shape every decision below works with. */
export interface ResolvedPreferences {
  pushEnabled: boolean;
  inAppEnabled: boolean;
  alertMuted: NotificationCategory[];
  feedMuted: NotificationCategory[];
  quietHoursEnabled: boolean;
  quietStartMinute: number | null; // 0–1439, local to `timezone`
  quietEndMinute: number | null;
  timezone: string | null;
}

const isCategory = (value: unknown): value is NotificationCategory =>
  (NOTIFICATION_CATEGORIES as readonly unknown[]).includes(value);

/** Known categories only, each once, in catalog order — so stored lists stay tidy. */
function cleanCategories(values: readonly unknown[]): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => values.includes(c));
}

const validMinute = (m: unknown): m is number =>
  typeof m === 'number' && Number.isInteger(m) && m >= 0 && m < 24 * 60;

/** Normalise a stored row (or no row) into ResolvedPreferences. Nothing is ever muted by a missing value. */
export function resolvePreferences(stored: StoredPreferences | null | undefined): ResolvedPreferences {
  const s = stored ?? {};
  return {
    pushEnabled: s.pushEnabled !== false,
    inAppEnabled: s.inAppEnabled !== false,
    alertMuted: cleanCategories(s.alertMutedCategories ?? []),
    feedMuted: cleanCategories(s.feedMutedCategories ?? []),
    quietHoursEnabled: s.quietHoursEnabled === true,
    quietStartMinute: validMinute(s.quietStartMinute) ? s.quietStartMinute : null,
    quietEndMinute: validMinute(s.quietEndMinute) ? s.quietEndMinute : null,
    timezone: s.timezone || null,
  };
}

/** The fields to write back for `prefs`. */
export function toStoredPreferences(prefs: ResolvedPreferences) {
  return {
    pushEnabled: prefs.pushEnabled,
    inAppEnabled: prefs.inAppEnabled,
    alertMutedCategories: cleanCategories(prefs.alertMuted),
    feedMutedCategories: cleanCategories(prefs.feedMuted),
    quietHoursEnabled: prefs.quietHoursEnabled,
    quietStartMinute: prefs.quietStartMinute,
    quietEndMinute: prefs.quietEndMinute,
  };
}

/** Add or remove `category` from a mute list. */
export function setMuted(
  list: readonly NotificationCategory[],
  category: NotificationCategory,
  muted: boolean
): NotificationCategory[] {
  const rest = list.filter((c) => c !== category);
  return cleanCategories(muted ? [...rest, category] : rest);
}

/**
 * Minutes since local midnight in `timeZone`, or in the runtime's own zone when the zone
 * is missing or unknown. Uses toLocaleTimeString rather than formatToParts, which not
 * every JS engine the app ships on supports.
 */
export function localMinuteOfDay(now: Date, timeZone: string | null): number {
  if (timeZone) {
    try {
      const text = now.toLocaleTimeString('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const match = text.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        return (Number(match[1]) % 24) * 60 + Number(match[2]);
      }
    } catch {
      // Unknown zone: fall through to the runtime's own clock.
    }
  }
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Whether `now` falls in the user's quiet hours, read in the user's own timezone.
 * A window may wrap midnight (22:00 → 07:00). start === end is a full day, matching how
 * the old hour-based check treated it.
 */
export function isInQuietHours(prefs: ResolvedPreferences, now: Date): boolean {
  const { quietHoursEnabled, quietStartMinute: start, quietEndMinute: end } = prefs;
  if (!quietHoursEnabled || start == null || end == null) return false;

  const minute = localMinuteOfDay(now, prefs.timezone);
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export type AlertChannel = 'push' | 'banner';

/**
 * Whether a notification of `type` may interrupt the user on `channel`.
 *
 * - The type must be one that alerts at all (the catalog's `alert`).
 * - The channel's master switch must be on.
 * - The type's category must not be alert-muted. Every category can be muted.
 * - Push also respects quiet hours; banners don't, since they only appear while the
 *   user is in the app.
 */
export function shouldAlert(
  type: NotificationType,
  prefs: ResolvedPreferences,
  channel: AlertChannel,
  now: Date = new Date()
): boolean {
  const info = NOTIFICATION_CATALOG[type];
  if (!info || !info.alert) return false;
  if (channel === 'push' ? !prefs.pushEnabled : !prefs.inAppEnabled) return false;
  if (prefs.alertMuted.includes(info.category)) return false;
  if (channel === 'push' && isInQuietHours(prefs, now)) return false;
  return true;
}

/**
 * Whether a notification shows in the feed. Feed-locked categories (money, results,
 * refunds, disputes) always do. A stored `category` wins; rows written before
 * categories existed fall back to the type's catalog entry; unknown types show.
 */
export function isFeedVisible(
  notification: { type?: string | null; category?: string | null },
  prefs: ResolvedPreferences
): boolean {
  const category = isCategory(notification.category)
    ? notification.category
    : NOTIFICATION_CATALOG[notification.type as NotificationType]?.category;
  if (!category) return true;
  if (CATEGORY_INFO[category].feedLocked) return true;
  return !prefs.feedMuted.includes(category);
}
