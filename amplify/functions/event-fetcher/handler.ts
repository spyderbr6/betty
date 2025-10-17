import { EventBridgeHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/event-fetcher';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

// TheSportsDB API configuration (API key "123" is the correct endpoint)
const SPORTSDB_API_BASE = 'https://www.thesportsdb.com/api/v1/json/123';

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

const LEAGUE_IDS: Record<string, string> = {
  NBA: '4387',
  NFL: '4391',
  MLB: '4424',
  NHL: '4380',
};

/**
 * Fetch events from TheSportsDB API
 */
async function fetchEventsFromAPI(league: string, date: string): Promise<SportsDBEvent[]> {
  try {
    const leagueId = LEAGUE_IDS[league];
    const url = `${SPORTSDB_API_BASE}/eventsday.php?d=${date}&id=${leagueId}`;

    console.log(`🔍 Fetching events for ${league} (League ID: ${leagueId}) on ${date}`);
    console.log(`🌐 Full URL: ${url}`);

    const response = await fetch(url);

    console.log(`📡 HTTP Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`❌ HTTP error! status: ${response.status}`);
      const errorText = await response.text();
      console.error(`❌ Error body: ${errorText}`);
      return [];
    }

    const rawText = await response.text();
    console.log(`📦 Raw API response for ${league} on ${date}:`, rawText.substring(0, 500)); // Log first 500 chars

    const data: SportsDBResponse = JSON.parse(rawText);

    if (!data.events || data.events.length === 0) {
      console.log(`⚠️  No events found for ${league} on ${date} (API returned null/empty - normal if no games)`);
      return [];
    }

    console.log(`✅ Found ${data.events.length} events for ${league} on ${date}`);

    // Log first event for verification
    if (data.events.length > 0) {
      console.log(`📋 Sample event:`, {
        id: data.events[0].idEvent,
        name: data.events[0].strEvent,
        date: data.events[0].dateEvent,
        time: data.events[0].strTime,
        status: data.events[0].strStatus
      });
    }

    return data.events;
  } catch (error) {
    console.error(`❌ Error fetching events for ${league}:`, error);
    console.error(`❌ Error details:`, error instanceof Error ? error.message : String(error));
    return [];
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
 * Generate team code (first 3 letters uppercase)
 */
function generateTeamCode(teamName: string): string {
  const cleaned = teamName
    .replace(/^(Los Angeles|New York|San|Golden State)\s+/i, '')
    .trim();

  return cleaned.slice(0, 3).toUpperCase();
}

/**
 * Parse sport type
 */
function parseSportType(sportName: string): 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER' {
  const sportLower = sportName.toLowerCase();

  if (sportLower.includes('basketball')) {
    if (sportLower.includes('college') || sportLower.includes('ncaa')) {
      return 'COLLEGE_BASKETBALL';
    }
    return 'NBA';
  }
  if (sportLower.includes('american football') || sportLower.includes('nfl')) {
    if (sportLower.includes('college') || sportLower.includes('ncaa')) {
      return 'COLLEGE_FOOTBALL';
    }
    return 'NFL';
  }
  if (sportLower.includes('baseball')) {
    return 'MLB';
  }
  if (sportLower.includes('ice hockey') || sportLower.includes('nhl')) {
    return 'NHL';
  }
  if (sportLower.includes('soccer') || sportLower.includes('football')) {
    return 'SOCCER';
  }

  return 'OTHER';
}

/**
 * Create or update event in database
 */
async function upsertEvent(event: SportsDBEvent): Promise<void> {
  try {
    // Check if event already exists
    const { data: existingEvents } = await client.models.LiveEvent.list({
      filter: {
        externalId: { eq: event.idEvent }
      }
    });

    const scheduledTime = new Date(`${event.dateEvent}T${event.strTime}`).toISOString();

    const eventData = {
      externalId: event.idEvent,
      sport: parseSportType(event.strSport),
      league: event.strLeague,
      homeTeam: event.strHomeTeam,
      awayTeam: event.strAwayTeam,
      homeTeamCode: generateTeamCode(event.strHomeTeam),
      awayTeamCode: generateTeamCode(event.strAwayTeam),
      venue: event.strVenue || undefined,
      city: event.strCity || undefined,
      country: event.strCountry || undefined,
      homeScore: event.intHomeScore ? parseInt(event.intHomeScore) : 0,
      awayScore: event.intAwayScore ? parseInt(event.intAwayScore) : 0,
      status: parseEventStatus(event.strStatus),
      quarter: event.strProgress || undefined,
      timeLeft: undefined, // TheSportsDB doesn't provide time left
      scheduledTime,
      season: event.strSeason || undefined,
      round: event.intRound || undefined,
    };

    if (existingEvents && existingEvents.length > 0) {
      // Update existing event
      const existingEvent = existingEvents[0];
      await client.models.LiveEvent.update({
        id: existingEvent.id,
        ...eventData,
      });
      console.log(`Updated event: ${event.strHomeTeam} vs ${event.strAwayTeam}`);
    } else {
      // Create new event
      await client.models.LiveEvent.create(eventData);
      console.log(`Created event: ${event.strHomeTeam} vs ${event.strAwayTeam}`);
    }
  } catch (error) {
    console.error(`Error upserting event ${event.idEvent}:`, error);
  }
}

/**
 * Main handler function
 */
export const handler: EventBridgeHandler<"Scheduled Event", null, boolean> = async (event) => {
  console.log('Event Fetcher triggered:', JSON.stringify(event, null, 2));

  try {
    // Get today's date
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    console.log(`📅 Current date: ${todayStr}`);

    // Get next 7 days
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    console.log(`📅 Checking dates: ${dates.join(', ')}`);

    // Fetch events for NBA and NFL for next 7 days
    const leagues = ['NBA', 'NFL'];

    let totalEventsProcessed = 0;
    let totalApiCalls = 0;

    for (const league of leagues) {
      for (const date of dates) {
        totalApiCalls++;
        const events = await fetchEventsFromAPI(league, date);

        console.log(`📊 ${league} on ${date}: Found ${events.length} events`);

        for (const eventData of events) {
          await upsertEvent(eventData);
          totalEventsProcessed++;
        }
      }
    }

    console.log(`✅ Event Fetcher completed. Made ${totalApiCalls} API calls, processed ${totalEventsProcessed} events.`);
    return true;

  } catch (error) {
    console.error('Event Fetcher failed:', error);
    return false;
  }
};
