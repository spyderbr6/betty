/**
 * Sports API Service
 *
 * Integration with TheSportsDB API for fetching real-time sports event data.
 * Free tier provides 30 requests/minute which is sufficient for our needs.
 *
 * API Documentation: https://www.thesportsdb.com/api.php
 */

const SPORTSDB_API_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

export interface SportsDBEvent {
  idEvent: string;
  strEvent: string; // "Home Team vs Away Team"
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string; // "Match Finished", "In Play", "Not Started"
  strProgress: string | null; // "Q1", "Q2", "Halftime", etc.
  strVenue: string;
  strCity: string | null;
  strCountry: string;
  dateEvent: string; // "2025-10-16"
  strTime: string; // "19:00:00"
  strLeague: string;
  strSeason: string;
  intRound: string | null;
  strSport: string;
}

export interface SportsDBResponse {
  events: SportsDBEvent[] | null;
}

export type SportLeague = 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'EPL' | 'UEFA';

const LEAGUE_IDS: Record<SportLeague, string> = {
  NBA: '4387',       // NBA
  NFL: '4391',       // NFL
  MLB: '4424',       // MLB
  NHL: '4380',       // NHL
  EPL: '4328',       // English Premier League
  UEFA: '4480',      // UEFA Champions League
};

/**
 * Fetch events for a specific league on a given date
 *
 * @param league - Sport league to fetch events for
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @returns Array of events or empty array on error
 */
export async function fetchEventsByLeagueAndDate(
  league: SportLeague,
  date?: string
): Promise<SportsDBEvent[]> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const leagueId = LEAGUE_IDS[league];

    const url = `${SPORTSDB_API_BASE}/eventsday.php?d=${targetDate}&l=${leagueId}`;
    console.log(`[SportsAPI] Fetching events for ${league} on ${targetDate}`);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[SportsAPI] HTTP error! status: ${response.status}`);
      return [];
    }

    const data: SportsDBResponse = await response.json();

    if (!data.events || data.events.length === 0) {
      console.log(`[SportsAPI] No events found for ${league} on ${targetDate}`);
      return [];
    }

    console.log(`[SportsAPI] Found ${data.events.length} events for ${league}`);
    return data.events;

  } catch (error) {
    console.error('[SportsAPI] Error fetching events:', error);
    return [];
  }
}

/**
 * Fetch events across multiple leagues for a given date
 *
 * @param leagues - Array of leagues to fetch
 * @param date - Date in YYYY-MM-DD format (defaults to today)
 * @returns Combined array of events from all leagues
 */
export async function fetchEventsForMultipleLeagues(
  leagues: SportLeague[],
  date?: string
): Promise<SportsDBEvent[]> {
  try {
    const fetchPromises = leagues.map(league =>
      fetchEventsByLeagueAndDate(league, date)
    );

    const results = await Promise.all(fetchPromises);
    const allEvents = results.flat();

    console.log(`[SportsAPI] Fetched ${allEvents.length} total events across ${leagues.length} leagues`);
    return allEvents;

  } catch (error) {
    console.error('[SportsAPI] Error fetching multiple leagues:', error);
    return [];
  }
}

/**
 * Fetch upcoming events (today + next 7 days) for specified leagues
 *
 * @param leagues - Array of leagues to fetch
 * @returns Array of upcoming events sorted by date
 */
export async function fetchUpcomingEvents(
  leagues: SportLeague[] = ['NBA', 'NFL']
): Promise<SportsDBEvent[]> {
  try {
    const today = new Date();
    const dates: string[] = [];

    // Get next 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    // Fetch events for all dates and leagues
    const fetchPromises = dates.flatMap(date =>
      leagues.map(league => fetchEventsByLeagueAndDate(league, date))
    );

    const results = await Promise.all(fetchPromises);
    const allEvents = results.flat();

    // Sort by scheduled time
    allEvents.sort((a, b) => {
      const dateA = new Date(`${a.dateEvent}T${a.strTime}`);
      const dateB = new Date(`${b.dateEvent}T${b.strTime}`);
      return dateA.getTime() - dateB.getTime();
    });

    console.log(`[SportsAPI] Fetched ${allEvents.length} upcoming events for next 7 days`);
    return allEvents;

  } catch (error) {
    console.error('[SportsAPI] Error fetching upcoming events:', error);
    return [];
  }
}

/**
 * Fetch a single event by ID
 *
 * @param eventId - TheSportsDB event ID
 * @returns Event details or null if not found
 */
export async function fetchEventById(eventId: string): Promise<SportsDBEvent | null> {
  try {
    const url = `${SPORTSDB_API_BASE}/lookupevent.php?id=${eventId}`;
    console.log(`[SportsAPI] Fetching event ${eventId}`);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[SportsAPI] HTTP error! status: ${response.status}`);
      return null;
    }

    const data: SportsDBResponse = await response.json();

    if (!data.events || data.events.length === 0) {
      console.log(`[SportsAPI] Event ${eventId} not found`);
      return null;
    }

    return data.events[0];

  } catch (error) {
    console.error('[SportsAPI] Error fetching event by ID:', error);
    return null;
  }
}

/**
 * Parse SportsDB status to our internal event status
 *
 * @param status - TheSportsDB status string
 * @returns Normalized event status
 */
export function parseEventStatus(status: string): 'UPCOMING' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' {
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

  // Default to upcoming if unclear
  return 'UPCOMING';
}

/**
 * Extract team code from team name (first 3 letters uppercase)
 *
 * @param teamName - Full team name
 * @returns 3-letter team code
 */
export function generateTeamCode(teamName: string): string {
  // Remove common prefixes
  const cleaned = teamName
    .replace(/^(Los Angeles|New York|San|Golden State)\s+/i, '')
    .trim();

  // Take first 3 letters and uppercase
  return cleaned.slice(0, 3).toUpperCase();
}

/**
 * Map TheSportsDB sport to our internal sport enum
 *
 * @param sportName - TheSportsDB sport name
 * @returns Internal sport enum value
 */
export function parseSportType(sportName: string): 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER' {
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
