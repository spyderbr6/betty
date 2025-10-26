/**
 * Event Service
 *
 * Handles event check-in/check-out logic, event discovery, and event management.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

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
        id: checkIn.id,
        userId: checkIn.userId,
        eventId: checkIn.eventId,
        checkInTime: checkIn.checkInTime,
        checkOutTime: checkIn.checkOutTime || undefined,
        isActive: checkIn.isActive || true,
        location: checkIn.location as any
      },
      event: {
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
      id: checkIn.id,
      userId: checkIn.userId,
      eventId: checkIn.eventId,
      checkInTime: checkIn.checkInTime,
      checkOutTime: checkIn.checkOutTime || undefined,
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
 * @param sport - Optional sport filter
 * @param limit - Maximum number of events to return
 * @returns Array of upcoming events
 */
export async function getUpcomingEvents(
  sport?: 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER',
  limit: number = 50
): Promise<LiveEventData[]> {
  try {
    console.log('[EventService] Fetching upcoming events');

    const now = new Date().toISOString();
    const next48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const filter: any = {
      and: [
        { scheduledTime: { ge: now } },
        { scheduledTime: { le: next48Hours } },
        { status: { ne: 'CANCELLED' } }
      ]
    };

    if (sport) {
      filter.and.push({ sport: { eq: sport } });
    }

    const { data: events, errors } = await client.models.LiveEvent.list({
      filter,
      limit
    });

    if (errors || !events) {
      console.error('[EventService] Error fetching upcoming events:', errors);
      return [];
    }

    // Sort by scheduled time
    const sortedEvents = events.sort((a, b) => {
      const dateA = new Date(a.scheduledTime).getTime();
      const dateB = new Date(b.scheduledTime).getTime();
      return dateA - dateB;
    });

    return sortedEvents.map(event => ({
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

    return sortedEvents.map(event => ({
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
 * @param sport - Optional sport filter
 * @returns Array of live events
 */
export async function getLiveEvents(
  sport?: 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER'
): Promise<LiveEventData[]> {
  try {
    console.log('[EventService] Fetching live events (time-based)');

    const now = new Date();
    const ninetyMinutesFromNow = new Date(now.getTime() + 90 * 60 * 1000);
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    // Get events that:
    // 1. Start within 90 minutes OR started within last 4 hours
    // 2. Are not finished or cancelled
    const filter: any = {
      and: [
        { scheduledTime: { le: ninetyMinutesFromNow.toISOString() } },
        { scheduledTime: { ge: fourHoursAgo.toISOString() } },
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

    console.log(`[EventService] Found ${events.length} live events based on time`);


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
    };

  } catch (error) {
    console.error('[EventService] Error fetching event by ID:', error);
    return null;
  }
}
