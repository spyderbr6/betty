/**
 * Sports events (LiveEvent rows written by the event-fetcher Lambda every 15 minutes):
 * how the app reads them and turns them into its own shape. Free of Amplify imports so it
 * is unit tested.
 */

import type { LiveEventData } from './eventService';

/** How long the event lists are reused before asking again: the fetcher's own cadence. */
export const EVENT_CACHE_TTL_MS = 15 * 60 * 1000;

/** A game counts as live for this long after its scheduled start (see isEventLive). */
export const LIVE_LOOKBACK_MS = 4 * 60 * 60 * 1000;

/** Pages of 500 the list query may read before stopping (a guard, not an expected size). */
export const MAX_EVENT_PAGES = 10;

/**
 * The earliest scheduled start the event lists ask for. Older rows can still be marked
 * active when the fetcher missed their final result, and must not crowd newer games out
 * of the query.
 */
export function eventWindowStart(now: number): string {
  return new Date(now - LIVE_LOOKBACK_MS).toISOString();
}

/** Whether the game has ended, which checks the user out of it. */
export function isEventOver(status: string | null | undefined): boolean {
  return status === 'FINISHED' || status === 'CANCELLED';
}

/** A LiveEvent row as queries and subscriptions return it. */
export interface LiveEventRecord {
  id?: string | null; // Amplify types the key as nullable; rows always have one
  externalId: string;
  sport?: LiveEventData['sport'] | null;
  league?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamShortName?: string | null;
  awayTeamShortName?: string | null;
  homeTeamCode?: string | null;
  awayTeamCode?: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status?: LiveEventData['status'] | null;
  quarter?: string | null;
  timeLeft?: string | null;
  scheduledTime: string;
  startTime?: string | null;
  endTime?: string | null;
  season?: string | null;
  round?: string | null;
  checkInCount?: number | null;
  betCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export function toLiveEventData(event: LiveEventRecord): LiveEventData {
  return {
    id: event.id ?? '',
    externalId: event.externalId,
    sport: event.sport || 'OTHER',
    league: event.league || '',
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    homeTeamShortName: event.homeTeamShortName ?? undefined,
    awayTeamShortName: event.awayTeamShortName ?? undefined,
    homeTeamCode: event.homeTeamCode ?? undefined,
    awayTeamCode: event.awayTeamCode ?? undefined,
    venue: event.venue ?? undefined,
    city: event.city ?? undefined,
    country: event.country ?? undefined,
    homeScore: event.homeScore || 0,
    awayScore: event.awayScore || 0,
    status: event.status || 'UPCOMING',
    quarter: event.quarter ?? undefined,
    timeLeft: event.timeLeft ?? undefined,
    scheduledTime: event.scheduledTime,
    startTime: event.startTime ?? undefined,
    endTime: event.endTime ?? undefined,
    season: event.season ?? undefined,
    round: event.round ?? undefined,
    checkInCount: event.checkInCount || 0,
    betCount: event.betCount || 0,
    createdAt: event.createdAt ?? undefined,
    updatedAt: event.updatedAt ?? undefined,
  };
}
