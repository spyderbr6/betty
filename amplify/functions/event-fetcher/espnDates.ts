/**
 * ESPN's scoreboard takes one day per request: since ~2026-09-20 a range
 * (`dates=YYYYMMDD-YYYYMMDD`) answers 400 "Failed to get events endpoint.", so the
 * fetcher asks for each day separately.
 */

/** Longest range a manual run may ask for: one request per day per league. */
export const MAX_RANGE_DAYS = 60;

/**
 * Every day from startDate to endDate inclusive (both YYYY-MM-DD, read as UTC days),
 * as the YYYYMMDD strings ESPN expects.
 */
export function espnDatesInRange(startDate: string, endDate: string): string[] {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (end < start) {
    throw new Error(`endDate ${endDate} is before startDate ${startDate}`);
  }

  const days: string[] = [];
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t).toISOString().slice(0, 10).replace(/-/g, ''));
    if (days.length > MAX_RANGE_DAYS) {
      throw new Error(`Range ${startDate} to ${endDate} is longer than ${MAX_RANGE_DAYS} days`);
    }
  }
  return days;
}

function parseDay(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Expected a YYYY-MM-DD date, got ${JSON.stringify(day)}`);
  }
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) {
    throw new Error(`Not a real date: ${day}`);
  }
  return t;
}
