/**
 * Decides whether a stored LiveEvent needs writing. The fetcher reads every game in its
 * window on every run, and most runs change nothing; writing anyway cost a DynamoDB write
 * per game and fired every app subscription to that game with identical data. Only the
 * fields the fetcher would send are compared: a field it omits is never cleared by the
 * update, so it cannot be a change.
 */

/** Fields the fetcher sends, as built in handler.ts upsertEvent. */
export type EventWrite = Record<string, unknown>;

/** The names of the fields in `next` whose values differ from `existing`; empty when none. */
export function changedEventFields(existing: Record<string, unknown>, next: EventWrite): string[] {
  return Object.keys(next).filter((field) => !sameValue(field, existing[field], next[field]));
}

function sameValue(field: string, stored: unknown, sent: unknown): boolean {
  if (field === 'scheduledTime') {
    // Same instant written in a different ISO form is not a change
    return toTime(stored) === toTime(sent) && toTime(sent) !== null;
  }
  if (field === 'homePeriodScores' || field === 'awayPeriodScores') {
    // a.json(): sent as JSON text; may read back as text or already parsed
    return canonicalJson(stored) === canonicalJson(sent);
  }
  return (stored ?? null) === (sent ?? null);
}

function toTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function canonicalJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return JSON.stringify(value);
}
