/**
 * Event Service
 *
 * Handles event check-in/check-out logic, event discovery, and event management.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

// Cache for recommended events (24 hour TTL)
const recommendationCache = new Map<string, { events: LiveEventData[]; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface LiveEventData {
  id: string;
  externalId: string;
  sport: 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER';
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
  venue?: string;
  city?: string;
  country?: string;
  homeScore: number;
  awayScore: number;
  status: 'UPCOMING' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  quarter?: string;
  timeLeft?: string;
  scheduledTime: string;
  startTime?: string;
  endTime?: string;
  season?: string;
  round?: string;
  checkInCount: number;
  betCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventCheckInData {
  id: string;
  userId: string;
  eventId: string;
  checkInTime: string;
  checkOutTime?: string;
  isActive: boolean;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

/**
 * Get user's currently active check-in
 *
 * @param userId - User ID to check
 * @returns Active check-in with event details or null
 */
export async function getUserCheckedInEvent(userId: string): Promise<{
  checkIn: EventCheckInData;
  event: LiveEventData;
} | null> {
  try {
    console.log(`[EventService] Getting checked-in event for user ${userId}`);

    // Get user's active check-ins
    const { data: checkIns, errors } = await client.models.EventCheckIn.list({
      filter: {
        and: [
          { userId: { eq: userId } },
          { isActive: { eq: true } }
        ]
      }
    });

    if (errors || !checkIns || checkIns.length === 0) {
      console.log('[EventService] No active check-in found');
      return null;
    }

    // User should only have one active check-in at a time
    const checkIn = checkIns[0];

    // Fetch the event details
    const { data: event, errors: eventErrors } = await client.models.LiveEvent.get({
      id: checkIn.eventId
    });

    if (eventErrors || !event) {
      console.error('[EventService] Error fetching event:', eventErrors);
      return null;
    }

    return {
      checkIn: {
        id: checkIn.id!,
        userId: checkIn.userId,
        eventId: checkIn.eventId,
        checkInTime: checkIn.checkInTime,
        checkOutTime: checkIn.checkOutTime ?? undefined,
        isActive: checkIn.isActive || true,
        location: checkIn.location as any
      },
      event: {
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
      }
    };

  } catch (error) {
    console.error('[EventService] Error getting checked-in event:', error);
    return null;
  }
}

/**
 * Check user into an event
 *
 * @param userId - User ID
 * @param eventId - Event ID to check into
 * @param location - Optional location data
 * @returns Created check-in or null on error
 */
export async function checkIntoEvent(
  userId: string,
  eventId: string,
  location?: { latitude: number; longitude: number; accuracy?: number }
): Promise<EventCheckInData | null> {
  try {
    console.log(`[EventService] Checking user ${userId} into event ${eventId}`);

    // First, check out of any existing events
    const existingCheckIn = await getUserCheckedInEvent(userId);
    if (existingCheckIn) {
      console.log('[EventService] User already checked into another event, checking out first');
      await checkOutOfEvent(userId, existingCheckIn.checkIn.id);
    }

    // Create new check-in
    const { data: checkIn, errors } = await client.models.EventCheckIn.create({
      userId,
      eventId,
      checkInTime: new Date().toISOString(),
      isActive: true,
      location: location as any
    });

    if (errors || !checkIn) {
      console.error('[EventService] Error creating check-in:', errors);
      return null;
    }

    // Increment event check-in count
    const { data: event } = await client.models.LiveEvent.get({ id: eventId });
    if (event) {
      await client.models.LiveEvent.update({
        id: eventId,
        checkInCount: (event.checkInCount || 0) + 1
      });
    }

    console.log('[EventService] Check-in successful');

    return {
      id: checkIn.id!,
      userId: checkIn.userId,
      eventId: checkIn.eventId,
      checkInTime: checkIn.checkInTime,
      checkOutTime: checkIn.checkOutTime ?? undefined,
      isActive: checkIn.isActive || true,
      location: checkIn.location as any
    };

  } catch (error) {
    console.error('[EventService] Error checking into event:', error);
    return null;
  }
}

/**
 * Check user out of an event
 *
 * @param userId - User ID
 * @param checkInId - Check-in ID to deactivate
 * @returns Success status
 */
export async function checkOutOfEvent(
  userId: string,
  checkInId: string
): Promise<boolean> {
  try {
    console.log(`[EventService] Checking user ${userId} out of event`);

    const { data: checkIn, errors } = await client.models.EventCheckIn.update({
      id: checkInId,
      isActive: false,
      checkOutTime: new Date().toISOString()
    });

    if (errors || !checkIn) {
      console.error('[EventService] Error checking out:', errors);
      return false;
    }

    // Decrement event check-in count
    const { data: event } = await client.models.LiveEvent.get({ id: checkIn.eventId });
    if (event && (event.checkInCount || 0) > 0) {
      await client.models.LiveEvent.update({
        id: checkIn.eventId,
        checkInCount: (event.checkInCount || 1) - 1
      });
    }

    console.log('[EventService] Check-out successful');
    return true;

  } catch (error) {
    console.error('[EventService] Error checking out of event:', error);
    return false;
  }
}

/**
 * Get upcoming events (next 48 hours)
 *
 * Uses GSI (status + scheduledTime) for efficient querying.
 *
 * @param sport - Optional sport filter
 * @param limit - Maximum number of events to return
 * @returns Array of upcoming events
 */
export async function getUpcomingEvents(
  sport?: 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER',
  limit: number = 200
): Promise<LiveEventData[]> {
  try {
    console.log('[EventService] Fetching upcoming events using GSI');

    const now = new Date().toISOString();
    const next48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // Query using the GSI for efficient filtering by status and scheduledTime
    const { data: events, errors } = await (client.models.LiveEvent as any).listEventsByStatusAndTime({
      status: 'UPCOMING',
      scheduledTime: {
        between: [now, next48Hours]
      },
      limit,
      filter: sport ? { sport: { eq: sport } } : undefined
    });

    if (errors || !events) {
      console.error('[EventService] Error fetching upcoming events:', errors);
      return [];
    }

    console.log(`[EventService] Found ${events.length} upcoming events`);

    // Events are already sorted by scheduledTime (GSI sort key)
    const sortedEvents = events;

    return sortedEvents.map((event): LiveEventData => ({
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

  } catch (error) {
    console.error('[EventService] Error fetching upcoming events:', error);
    return [];
  }
}

/**
 * Get trending events (sorted by check-in count)
 *
 * @param limit - Maximum number of events to return
 * @returns Array of trending events
 */
export async function getTrendingEvents(limit: number = 20): Promise<LiveEventData[]> {
  try {
    console.log('[EventService] Fetching trending events');

    // Get events that are live or upcoming soon
    const { data: events, errors } = await client.models.LiveEvent.list({
      filter: {
        or: [
          { status: { eq: 'LIVE' } },
          { status: { eq: 'UPCOMING' } },
          { status: { eq: 'HALFTIME' } }
        ]
      },
      limit: 100 // Fetch more to sort client-side
    });

    if (errors || !events) {
      console.error('[EventService] Error fetching trending events:', errors);
      return [];
    }

    // Sort by check-in count (descending)
    const sortedEvents = events
      .sort((a, b) => (b.checkInCount || 0) - (a.checkInCount || 0))
      .slice(0, limit);

    return sortedEvents.map((event): LiveEventData => ({
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

  } catch (error) {
    console.error('[EventService] Error fetching trending events:', error);
    return [];
  }
}

/**
 * Get live events (currently in progress based on scheduled time)
 *
 * A game is considered "live" if:
 * - Scheduled time is within 90 minutes in the future OR has already started
 * - Less than 4 hours have passed since scheduled time (game duration)
 * - Status is not FINISHED or CANCELLED
 *
 * Uses simple filtering since the time window is small (~5.5 hours).
 *
 * @param sport - Optional sport filter
 * @returns Array of live events
 */
export async function getLiveEvents(
  sport?: 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER'
): Promise<LiveEventData[]> {
  try {
    console.log('[EventService] Fetching live events');

    const now = new Date();
    const ninetyMinutesFromNow = new Date(now.getTime() + 90 * 60 * 1000);
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    const filter: any = {
      and: [
        { scheduledTime: { ge: fourHoursAgo.toISOString() } },
        { scheduledTime: { le: ninetyMinutesFromNow.toISOString() } },
        { status: { ne: 'FINISHED' } },
        { status: { ne: 'CANCELLED' } }
      ]
    };

    if (sport) {
      filter.and.push({ sport: { eq: sport } });
    }

    const { data: events, errors } = await client.models.LiveEvent.list({
      filter,
      limit: 100
    });

    if (errors || !events) {
      console.error('[EventService] Error fetching live events:', errors);
      return [];
    }

    console.log(`[EventService] Found ${events.length} live events`);

    return events.map(event => ({
      id: event.id,
      externalId: event.externalId,
      sport: event.sport || 'OTHER',
      league: event.league || '',
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      homeTeamCode: event.homeTeamCode || undefined,
      awayTeamCode: event.awayTeamCode || undefined,
      venue: event.venue || undefined,
      city: event.city || undefined,
      country: event.country || undefined,
      homeScore: event.homeScore || 0,
      awayScore: event.awayScore || 0,
      status: event.status || 'UPCOMING',
      quarter: event.quarter || undefined,
      timeLeft: event.timeLeft || undefined,
      scheduledTime: event.scheduledTime,
      startTime: event.startTime || undefined,
      endTime: event.endTime || undefined,
      season: event.season || undefined,
      round: event.round || undefined,
      checkInCount: event.checkInCount || 0,
      betCount: event.betCount || 0,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    }));

  } catch (error) {
    console.error('[EventService] Error fetching live events:', error);
    return [];
  }
}

/**
 * Get event by ID
 *
 * @param eventId - Event ID
 * @returns Event data or null
 */
export async function getEventById(eventId: string): Promise<LiveEventData | null> {
  try {
    const { data: event, errors } = await client.models.LiveEvent.get({ id: eventId });

    if (errors || !event) {
      return null;
    }

    return {
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
    };

  } catch (error) {
    console.error('[EventService] Error fetching event by ID:', error);
    return null;
  }
}

/**
 * Get user's recent event check-in history
 *
 * @param userId - User ID
 * @param daysBack - Number of days to look back (default: 30)
 * @returns Array of check-ins with event data
 */
export async function getUserEventCheckInHistory(
  userId: string,
  daysBack: number = 30
): Promise<Array<{ checkIn: EventCheckInData; event: LiveEventData }>> {
  try {
    console.log(`[EventService] Fetching check-in history for user ${userId} (${daysBack} days)`);

    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    // Get user's check-ins from the last N days
    const { data: checkIns, errors } = await client.models.EventCheckIn.list({
      filter: {
        and: [
          { userId: { eq: userId } },
          { checkInTime: { ge: cutoffDate } }
        ]
      },
      limit: 100 // Reasonable limit
    });

    if (errors || !checkIns || checkIns.length === 0) {
      console.log('[EventService] No recent check-ins found');
      return [];
    }

    // Fetch all unique events
    const eventIds = [...new Set(checkIns.map(c => c.eventId))];
    const eventPromises = eventIds.map(id => client.models.LiveEvent.get({ id }));
    const eventResults = await Promise.all(eventPromises);

    // Build event map
    const eventMap = new Map<string, LiveEventData>();
    eventResults.forEach(result => {
      if (result.data) {
        const event = result.data;
        eventMap.set(event.id!, {
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
        });
      }
    });

    // Combine check-ins with events
    const history = checkIns
      .filter(checkIn => eventMap.has(checkIn.eventId))
      .map(checkIn => ({
        checkIn: {
          id: checkIn.id!,
          userId: checkIn.userId,
          eventId: checkIn.eventId,
          checkInTime: checkIn.checkInTime,
          checkOutTime: checkIn.checkOutTime ?? undefined,
          isActive: checkIn.isActive || false,
          location: checkIn.location as any
        },
        event: eventMap.get(checkIn.eventId)!
      }))
      .sort((a, b) => {
        // Sort by check-in time descending (most recent first)
        return new Date(b.checkIn.checkInTime).getTime() - new Date(a.checkIn.checkInTime).getTime();
      });

    console.log(`[EventService] Found ${history.length} check-ins in last ${daysBack} days`);
    return history;

  } catch (error) {
    console.error('[EventService] Error fetching check-in history:', error);
    return [];
  }
}

/**
 * Get recommended upcoming events based on user's check-in history
 * Results are cached for 24 hours
 *
 * @param userId - User ID
 * @param limit - Maximum number of events to return (default: 10)
 * @returns Array of recommended upcoming events
 */
export async function getRecommendedUpcomingEvents(
  userId: string,
  limit: number = 10
): Promise<LiveEventData[]> {
  try {
    // Check cache first
    const cacheKey = `recommendations_${userId}`;
    const cached = recommendationCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      console.log('[EventService] Returning cached recommendations');
      return cached.events;
    }

    console.log('[EventService] Generating fresh recommendations');

    // Get user's recent check-in history
    const history = await getUserEventCheckInHistory(userId, 30);

    if (history.length === 0) {
      console.log('[EventService] No check-in history, returning empty recommendations');
      return [];
    }

    // Extract sports from check-in history
    const sportCounts = new Map<string, number>();
    history.forEach(({ event }) => {
      const count = sportCounts.get(event.sport) || 0;
      sportCounts.set(event.sport, count + 1);
    });

    // Get sports sorted by frequency
    const topSports = Array.from(sportCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sport]) => sport);

    console.log(`[EventService] User's top sports:`, topSports);

    // Get upcoming events for those sports
    const upcomingPromises = topSports.slice(0, 3).map(sport =>
      getUpcomingEvents(sport as any, 20)
    );
    const upcomingResults = await Promise.all(upcomingPromises);

    // Flatten and deduplicate
    const allUpcoming = upcomingResults.flat();
    const uniqueEvents = new Map<string, LiveEventData>();
    allUpcoming.forEach(event => {
      if (!uniqueEvents.has(event.id)) {
        uniqueEvents.set(event.id, event);
      }
    });

    // Sort by scheduled time (soonest first) and limit
    const recommendations = Array.from(uniqueEvents.values())
      .sort((a, b) => {
        const dateA = new Date(a.scheduledTime).getTime();
        const dateB = new Date(b.scheduledTime).getTime();
        return dateA - dateB;
      })
      .slice(0, limit);

    // Cache the results
    recommendationCache.set(cacheKey, {
      events: recommendations,
      timestamp: now
    });

    console.log(`[EventService] Returning ${recommendations.length} recommended events`);
    return recommendations;

  } catch (error) {
    console.error('[EventService] Error generating recommendations:', error);
    return [];
  }
}
