/**
 * Event Cache Service
 *
 * Centralized event caching with 24-hour TTL.
 * Fetches all events once and filters client-side based on scheduledTime.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { LiveEventData } from './eventService';

const client = generateClient<Schema>();

interface EventCache {
  events: LiveEventData[];
  timestamp: number;
}

let eventCache: EventCache | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Determine if an event is "live" based on its scheduled time
 * Live = scheduled within last 4 hours and not finished/cancelled
 */
export function isEventLive(event: LiveEventData): boolean {
  const now = new Date();
  const scheduledTime = new Date(event.scheduledTime);
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const ninetyMinutesFromNow = new Date(now.getTime() + 90 * 60 * 1000);

  // Event is live if:
  // 1. Scheduled time is between 4 hours ago and 90 minutes from now
  // 2. Status is not FINISHED or CANCELLED
  const isInLiveWindow = scheduledTime >= fourHoursAgo && scheduledTime <= ninetyMinutesFromNow;
  const isNotFinished = event.status !== 'FINISHED' && event.status !== 'CANCELLED';

  return isInLiveWindow && isNotFinished;
}

/**
 * Determine if an event is "upcoming" based on its scheduled time
 * Upcoming = scheduled in next 48 hours and status is UPCOMING
 */
export function isEventUpcoming(event: LiveEventData): boolean {
  const now = new Date();
  const scheduledTime = new Date(event.scheduledTime);
  const next48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Event is upcoming if:
  // 1. Scheduled time is in the future (after now)
  // 2. Scheduled time is within next 48 hours
  // 3. Status is UPCOMING
  return scheduledTime > now && scheduledTime <= next48Hours && event.status === 'UPCOMING';
}

/**
 * Determine if an event is "upcoming" for squares bet creation
 * Extended window: scheduled in next 14 days and status is UPCOMING
 * This allows users to create squares games for events further out
 */
export function isEventUpcomingForSquares(event: LiveEventData): boolean {
  const now = new Date();
  const scheduledTime = new Date(event.scheduledTime);
  const next14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Event is upcoming for squares if:
  // 1. Scheduled time is in the future (after now)
  // 2. Scheduled time is within next 14 days
  // 3. Status is UPCOMING
  return scheduledTime > now && scheduledTime <= next14Days && event.status === 'UPCOMING';
}

/**
 * Fetch all events from database
 * This is the only place that actually queries DynamoDB for events
 *
 * Uses the isActive GSI for efficient single-query retrieval:
 * - isActive=1 returns all UPCOMING/LIVE/HALFTIME events (managed by Lambda)
 * - Results are sorted by scheduledTime via the GSI
 * - No scan+filter needed - direct GSI query
 */
async function fetchAllEvents(): Promise<LiveEventData[]> {
  try {
    console.log('[EventCache] Fetching active events from database via isActive GSI');

    // Query for all active events (UPCOMING/LIVE/HALFTIME) using efficient GSI
    // The event-fetcher Lambda manages isActive lifecycle:
    //   - Sets isActive=1 for UPCOMING/LIVE/HALFTIME
    //   - Sets isActive=0 for FINISHED/CANCELLED/POSTPONED
    const { data: events, errors } = await client.models.LiveEvent.activeEventsByTime({
      isActive: 1
    }, {
      limit: 500, // High limit to get all active events
      sortDirection: 'ASC' // Soonest first
    });

    if (errors || !events) {
      console.error('[EventCache] Error fetching events:', errors);
      return [];
    }

    console.log(`[EventCache] Fetched ${events.length} active events from database via GSI`);

    // Map to LiveEventData format
    const mappedEvents: LiveEventData[] = events.map(event => ({
      id: event.id!,
      externalId: event.externalId,
      sport: event.sport || 'OTHER',
      league: event.league || '',
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
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
      updatedAt: event.updatedAt ?? undefined
    }));

    // Deduplicate by ID (database may have duplicates)
    const uniqueEvents = new Map<string, LiveEventData>();
    mappedEvents.forEach(event => {
      if (!uniqueEvents.has(event.id)) {
        uniqueEvents.set(event.id, event);
      }
    });

    const deduped = Array.from(uniqueEvents.values());
    if (deduped.length !== mappedEvents.length) {
      console.log(`[EventCache] Deduplicated ${mappedEvents.length - deduped.length} duplicate events from database (${deduped.length} unique events)`);
    }

    return deduped;
  } catch (error) {
    console.error('[EventCache] Error fetching events:', error);
    return [];
  }
}

/**
 * Get cached events or fetch fresh if cache is expired
 */
export async function getCachedEvents(forceRefresh: boolean = false): Promise<LiveEventData[]> {
  const now = Date.now();

  // Check if cache is valid
  if (!forceRefresh && eventCache && (now - eventCache.timestamp) < CACHE_TTL) {
    console.log('[EventCache] Returning cached events');
    return eventCache.events;
  }

  // Cache expired or force refresh - fetch fresh data
  console.log('[EventCache] Cache expired or force refresh, fetching fresh data');
  const events = await fetchAllEvents();

  // Update cache
  eventCache = {
    events,
    timestamp: now
  };

  return events;
}

/**
 * Get only live events from cache (client-side filtering)
 */
export async function getLiveEventsFromCache(forceRefresh: boolean = false): Promise<LiveEventData[]> {
  const allEvents = await getCachedEvents(forceRefresh);
  const liveEvents = allEvents.filter(isEventLive);

  // Sort by scheduled time (soonest first)
  liveEvents.sort((a, b) => {
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  console.log(`[EventCache] Filtered ${liveEvents.length} live events from ${allEvents.length} cached events`);
  return liveEvents;
}

/**
 * Get only upcoming events from cache (client-side filtering)
 */
export async function getUpcomingEventsFromCache(forceRefresh: boolean = false): Promise<LiveEventData[]> {
  const allEvents = await getCachedEvents(forceRefresh);
  const upcomingEvents = allEvents.filter(isEventUpcoming);

  // Sort by scheduled time (soonest first)
  upcomingEvents.sort((a, b) => {
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  console.log(`[EventCache] Filtered ${upcomingEvents.length} upcoming events from ${allEvents.length} cached events`);
  return upcomingEvents;
}

/**
 * Get upcoming events for squares bet creation (extended 14-day window)
 * Uses isEventUpcomingForSquares which has a longer lookahead window
 */
export async function getUpcomingEventsForSquaresFromCache(forceRefresh: boolean = false): Promise<LiveEventData[]> {
  const allEvents = await getCachedEvents(forceRefresh);
  const upcomingEvents = allEvents.filter(isEventUpcomingForSquares);

  // Sort by scheduled time (soonest first)
  upcomingEvents.sort((a, b) => {
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  console.log(`[EventCache] Filtered ${upcomingEvents.length} upcoming events (14-day window) from ${allEvents.length} cached events`);
  return upcomingEvents;
}

/**
 * Get both live and upcoming events from cache
 */
export async function getAllEventsFromCache(forceRefresh: boolean = false): Promise<{
  liveEvents: LiveEventData[];
  upcomingEvents: LiveEventData[];
}> {
  const allEvents = await getCachedEvents(forceRefresh);

  const liveEvents = allEvents.filter(isEventLive);
  const upcomingEvents = allEvents.filter(isEventUpcoming);

  // Sort live events by scheduled time (soonest first)
  liveEvents.sort((a, b) => {
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  // Sort upcoming by scheduled time (soonest first)
  upcomingEvents.sort((a, b) => {
    return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
  });

  console.log(`[EventCache] Filtered ${liveEvents.length} live and ${upcomingEvents.length} upcoming from ${allEvents.length} cached events`);

  return { liveEvents, upcomingEvents };
}

/**
 * Clear the event cache (useful for testing or forced refresh)
 */
export function clearEventCache(): void {
  console.log('[EventCache] Clearing event cache');
  eventCache = null;
}

/**
 * Get cache stats for debugging
 */
export function getEventCacheStats(): { cached: boolean; eventCount: number; age: number } {
  if (!eventCache) {
    return { cached: false, eventCount: 0, age: 0 };
  }

  return {
    cached: true,
    eventCount: eventCache.events.length,
    age: Date.now() - eventCache.timestamp
  };
}
