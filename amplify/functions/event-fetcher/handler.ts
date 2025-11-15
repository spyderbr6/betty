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

// ESPN API configuration (unofficial public API)
const ESPN_API_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

interface ESPNTeam {
  id: string;
  location: string;
  name: string;
  abbreviation: string;
  displayName: string;
}

interface ESPNCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  team: ESPNTeam;
  score: string;
  winner?: boolean;
}

interface ESPNStatus {
  type: {
    id: string;
    name: string;
    state: string;
    completed: boolean;
    description: string;
    detail: string;
    shortDetail: string;
  };
  period?: number;
  displayClock?: string;
}

interface ESPNVenue {
  id: string;
  fullName: string;
  address?: {
    city?: string;
    state?: string;
  };
}

interface ESPNCompetition {
  id: string;
  uid: string;
  date: string;
  attendance?: number;
  status: ESPNStatus;
  venue?: ESPNVenue;
  competitors: ESPNCompetitor[];
}

interface ESPNEvent {
  id: string;
  uid: string;
  date: string;
  name: string;
  shortName: string;
  season: {
    year: number;
    type: number;
  };
  competitions: ESPNCompetition[];
}

interface ESPNResponse {
  events: ESPNEvent[];
}

const LEAGUE_ENDPOINTS: Record<string, string> = {
  NBA: 'basketball/nba',
  NFL: 'football/nfl',
};

/**
 * Fetch events from ESPN API
 */
async function fetchEventsFromAPI(league: string, date: string): Promise<ESPNEvent[]> {
  try {
    const leagueEndpoint = LEAGUE_ENDPOINTS[league];
    if (!leagueEndpoint) {
      console.error(`❌ Unknown league: ${league}`);
      return [];
    }

    // Format date as YYYYMMDD for ESPN API
    const formattedDate = date.replace(/-/g, '');
    const url = `${ESPN_API_BASE}/${leagueEndpoint}/scoreboard?dates=${formattedDate}`;

    console.log(`🔍 Fetching events for ${league} on ${date}`);
    console.log(`🌐 Full URL: ${url}`);

    const response = await fetch(url);

    console.log(`📡 HTTP Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`❌ HTTP error! status: ${response.status}`);
      const errorText = await response.text();
      console.error(`❌ Error body: ${errorText}`);
      return [];
    }

    const data: ESPNResponse = await response.json();

    if (!data.events || data.events.length === 0) {
      console.log(`⚠️  No events found for ${league} on ${date} (ESPN returned empty - normal if no games)`);
      return [];
    }

    console.log(`✅ Found ${data.events.length} ${league} events on ${date}`);

    // Log first event for verification
    if (data.events.length > 0) {
      const firstEvent = data.events[0];
      const competition = firstEvent.competitions[0];
      console.log(`📋 Sample event:`, {
        id: firstEvent.id,
        name: firstEvent.name,
        date: firstEvent.date,
        status: competition?.status?.type?.name,
        venue: competition?.venue?.fullName
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
 * Parse event status from ESPN API
 */
function parseEventStatus(espnStatus: ESPNStatus): 'UPCOMING' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' {
  const state = espnStatus.type.state.toLowerCase();
  const name = espnStatus.type.name.toLowerCase();
  const detail = espnStatus.type.detail?.toLowerCase() || '';

  // ESPN states: pre, in, post
  if (state === 'pre') {
    if (name.includes('postponed') || detail.includes('postponed')) {
      return 'POSTPONED';
    }
    if (name.includes('cancel') || detail.includes('cancel')) {
      return 'CANCELLED';
    }
    return 'UPCOMING';
  }

  if (state === 'in') {
    if (name.includes('halftime') || detail.includes('halftime')) {
      return 'HALFTIME';
    }
    return 'LIVE';
  }

  if (state === 'post') {
    if (name.includes('postponed') || detail.includes('postponed')) {
      return 'POSTPONED';
    }
    if (name.includes('cancel') || detail.includes('cancel')) {
      return 'CANCELLED';
    }
    return 'FINISHED';
  }

  // Default to UPCOMING
  return 'UPCOMING';
}

/**
 * Map league name to sport type
 */
function mapLeagueToSportType(league: string): 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER' {
  switch (league) {
    case 'NBA':
      return 'NBA';
    case 'NFL':
      return 'NFL';
    case 'MLB':
      return 'MLB';
    case 'NHL':
      return 'NHL';
    default:
      return 'OTHER';
  }
}

/**
 * Create or update event in database
 */
async function upsertEvent(event: ESPNEvent, league: string): Promise<void> {
  try {
    // Get the first competition (ESPN events can have multiple, but usually just 1)
    const competition = event.competitions[0];
    if (!competition) {
      console.error(`No competition data for event ${event.id}`);
      return;
    }

    // Find home and away teams from competitors
    const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home');
    const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away');

    if (!homeCompetitor || !awayCompetitor) {
      console.error(`Missing home/away competitors for event ${event.id}`);
      return;
    }

    // Check if event already exists using the externalId GSI
    const { data: existingEvents, errors: queryErrors } = await client.models.LiveEvent.listEventsByExternalId({
      externalId: event.id,
      limit: 100 // Get all potential duplicates
    });

    if (queryErrors) {
      console.error(`❌ Error querying for existing event ${event.id}:`, queryErrors);
      return;
    }

    const eventData = {
      externalId: event.id,
      sport: mapLeagueToSportType(league),
      league: league,
      homeTeam: homeCompetitor.team.displayName || homeCompetitor.team.name,
      awayTeam: awayCompetitor.team.displayName || awayCompetitor.team.name,
      homeTeamCode: homeCompetitor.team.abbreviation,
      awayTeamCode: awayCompetitor.team.abbreviation,
      venue: competition.venue?.fullName || undefined,
      city: competition.venue?.address?.city || undefined,
      country: undefined, // ESPN doesn't provide country in this endpoint
      homeScore: parseInt(homeCompetitor.score) || 0,
      awayScore: parseInt(awayCompetitor.score) || 0,
      status: parseEventStatus(competition.status),
      quarter: competition.status.period ? `Period ${competition.status.period}` : undefined,
      timeLeft: competition.status.displayClock || undefined,
      scheduledTime: new Date(competition.date).toISOString(),
      season: event.season?.year?.toString() || undefined,
      round: undefined, // ESPN doesn't provide round in scoreboard endpoint
    };

    if (existingEvents && existingEvents.length > 0) {
      // Update the first existing event
      const existingEvent = existingEvents[0];
      await client.models.LiveEvent.update({
        id: existingEvent.id,
        ...eventData,
      });
      console.log(`✅ Updated: ${awayCompetitor.team.abbreviation} @ ${homeCompetitor.team.abbreviation} (id: ${existingEvent.id})`);

      // If there are duplicates, delete them
      if (existingEvents.length > 1) {
        console.log(`⚠️  Found ${existingEvents.length} duplicate entries for externalId ${event.id}, cleaning up...`);
        for (let i = 1; i < existingEvents.length; i++) {
          const duplicate = existingEvents[i];
          try {
            await client.models.LiveEvent.delete({ id: duplicate.id });
            console.log(`🗑️  Deleted duplicate entry: ${duplicate.id}`);
          } catch (deleteError) {
            console.error(`❌ Error deleting duplicate ${duplicate.id}:`, deleteError);
          }
        }
      }
    } else {
      // Create new event
      try {
        const result = await client.models.LiveEvent.create(eventData);
        if (result.errors) {
          console.error(`❌ Error creating event ${event.id}:`, result.errors);
        } else {
          console.log(`✅ Created: ${awayCompetitor.team.abbreviation} @ ${homeCompetitor.team.abbreviation} (id: ${result.data?.id})`);
        }
      } catch (createError) {
        console.error(`❌ Exception creating event ${event.id}:`, createError);
      }
    }
  } catch (error) {
    console.error(`❌ Error upserting event ${event.id}:`, error);
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
          await upsertEvent(eventData, league);
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
