import { EventBridgeHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/live-score-updater';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

// TheSportsDB API configuration
const SPORTSDB_API_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

interface SportsDBEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string;
  strProgress: string | null;
  strVenue: string;
  strCity: string | null;
  strCountry: string;
  dateEvent: string;
  strTime: string;
  strLeague: string;
  strSeason: string;
  intRound: string | null;
  strSport: string;
}

interface SportsDBResponse {
  events: SportsDBEvent[] | null;
}

/**
 * Fetch a single event from TheSportsDB API by ID
 */
async function fetchEventByIdFromAPI(eventId: string): Promise<SportsDBEvent | null> {
  try {
    const url = `${SPORTSDB_API_BASE}/lookupevent.php?id=${eventId}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return null;
    }

    const data: SportsDBResponse = await response.json();

    if (!data.events || data.events.length === 0) {
      return null;
    }

    return data.events[0];
  } catch (error) {
    console.error(`Error fetching event ${eventId}:`, error);
    return null;
  }
}

/**
 * Parse event status from TheSportsDB
 */
function parseEventStatus(status: string): 'UPCOMING' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' {
  const statusLower = status.toLowerCase();

  if (statusLower.includes('not started') || statusLower.includes('upcoming')) {
    return 'UPCOMING';
  }
  if (statusLower.includes('in play') || statusLower.includes('live')) {
    return 'LIVE';
  }
  if (statusLower.includes('halftime') || statusLower.includes('half time')) {
    return 'HALFTIME';
  }
  if (statusLower.includes('finished') || statusLower.includes('final')) {
    return 'FINISHED';
  }
  if (statusLower.includes('postponed')) {
    return 'POSTPONED';
  }
  if (statusLower.includes('cancelled') || statusLower.includes('canceled')) {
    return 'CANCELLED';
  }

  return 'UPCOMING';
}

/**
 * Update event scores in database
 */
async function updateEventScores(event: SportsDBEvent, dbEventId: string): Promise<void> {
  try {
    const updateData = {
      id: dbEventId,
      homeScore: event.intHomeScore ? parseInt(event.intHomeScore) : 0,
      awayScore: event.intAwayScore ? parseInt(event.intAwayScore) : 0,
      status: parseEventStatus(event.strStatus),
      quarter: event.strProgress || undefined,
      updatedAt: new Date().toISOString(),
    };

    // Set start time if event is now live
    if (updateData.status === 'LIVE' || updateData.status === 'HALFTIME') {
      const { data: currentEvent } = await client.models.LiveEvent.get({ id: dbEventId });
      if (currentEvent && !currentEvent.startTime) {
        (updateData as any).startTime = new Date().toISOString();
      }
    }

    // Set end time if event is finished
    if (updateData.status === 'FINISHED') {
      const { data: currentEvent } = await client.models.LiveEvent.get({ id: dbEventId });
      if (currentEvent && !currentEvent.endTime) {
        (updateData as any).endTime = new Date().toISOString();

        // Check out all users who were checked into this event
        const { data: checkIns } = await client.models.EventCheckIn.list({
          filter: {
            and: [
              { eventId: { eq: dbEventId } },
              { isActive: { eq: true } }
            ]
          }
        });

        if (checkIns && checkIns.length > 0) {
          console.log(`Checking out ${checkIns.length} users from finished event`);
          for (const checkIn of checkIns) {
            await client.models.EventCheckIn.update({
              id: checkIn.id,
              isActive: false,
              checkOutTime: new Date().toISOString()
            });
          }

          // Reset check-in count
          (updateData as any).checkInCount = 0;
        }
      }
    }

    await client.models.LiveEvent.update(updateData);
    console.log(`Updated scores: ${event.strHomeTeam} ${updateData.homeScore} - ${updateData.awayScore} ${event.strAwayTeam} (${updateData.status})`);

  } catch (error) {
    console.error(`Error updating event ${dbEventId}:`, error);
  }
}

/**
 * Main handler function
 */
export const handler: EventBridgeHandler<"Scheduled Event", null, boolean> = async (event) => {
  console.log('Live Score Updater triggered:', JSON.stringify(event, null, 2));

  try {
    // Get all events that are LIVE, HALFTIME, or UPCOMING (within next 2 hours)
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const { data: liveEvents } = await client.models.LiveEvent.list({
      filter: {
        or: [
          { status: { eq: 'LIVE' } },
          { status: { eq: 'HALFTIME' } },
          {
            and: [
              { status: { eq: 'UPCOMING' } },
              { scheduledTime: { le: twoHoursLater.toISOString() } }
            ]
          }
        ]
      }
    });

    if (!liveEvents || liveEvents.length === 0) {
      console.log('No live or upcoming events to update');
      return true;
    }

    console.log(`Updating ${liveEvents.length} events`);

    let updatedCount = 0;

    for (const dbEvent of liveEvents) {
      // Fetch latest data from API
      const apiEvent = await fetchEventByIdFromAPI(dbEvent.externalId);

      if (apiEvent) {
        await updateEventScores(apiEvent, dbEvent.id);
        updatedCount++;
      }

      // Small delay to respect API rate limits (30 req/min = 2 seconds between requests)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`Live Score Updater completed. Updated ${updatedCount} events.`);
    return true;

  } catch (error) {
    console.error('Live Score Updater failed:', error);
    return false;
  }
};
