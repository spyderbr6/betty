/**
 * Whether a fetcher run failed. Until 2026-10 every run reported success whatever
 * happened, and ESPN refusing every request went unnoticed for four weeks. A failed run
 * now throws, so it shows on the Lambda's error metric (and the schedule retries it).
 *
 * Fails when a league got nothing back at all (every request for it failed: an outage
 * or a changed endpoint) or when any database write failed. One failed day in a league
 * whose other days answered is left to the next run 15 minutes later.
 */

export interface LeagueRequests {
  league: string;
  requests: number;
  failed: number;
}

/** The reason the run failed, or null when it did not. */
export function fetcherRunError(leagues: LeagueRequests[], failedWrites: number): string | null {
  const problems: string[] = [];

  const dark = leagues.filter((l) => l.requests > 0 && l.failed === l.requests);
  if (dark.length > 0) {
    problems.push(`every ESPN request failed for ${dark.map((l) => `${l.league} (${l.failed})`).join(', ')}`);
  }
  if (failedWrites > 0) {
    problems.push(`${failedWrites} event write${failedWrites === 1 ? '' : 's'} failed`);
  }

  return problems.length > 0 ? `Event fetcher run failed: ${problems.join('; ')}` : null;
}
