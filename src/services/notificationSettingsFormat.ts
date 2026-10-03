/**
 * Formatting for the notification settings screen. Pure, so it is unit tested
 * (__tests__/notificationSettingsFormat.test.ts).
 */

const MINUTES_PER_DAY = 24 * 60;

/** 1320 → "10:00 PM", 0 → "12:00 AM", 750 → "12:30 PM". */
export function formatMinuteOfDay(minute: number): string {
  const m = ((Math.round(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours24 = Math.floor(m / 60);
  const minutes = m % 60;
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** Move a time of day by `delta` minutes, wrapping around midnight. */
export function stepMinuteOfDay(minute: number, delta: number): number {
  return (((minute + delta) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** "Active today", "Active yesterday", "Active 5 days ago", or "Active Mar 3". */
export function describeLastSeen(iso: string | null | undefined, now: Date = new Date()): string {
  const seen = iso ? new Date(iso) : null;
  if (!seen || Number.isNaN(seen.getTime())) return 'Never active';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(seen)) / (24 * 60 * 60 * 1000));

  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 7) return `Active ${days} days ago`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Active ${months[seen.getMonth()]} ${seen.getDate()}`;
}
