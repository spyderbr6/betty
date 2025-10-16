/**
 * Event Management Types
 *
 * Type definitions for live sporting events and check-ins
 */

export type SportType = 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'SOCCER' | 'COLLEGE_FOOTBALL' | 'COLLEGE_BASKETBALL' | 'OTHER';

export type EventStatus = 'UPCOMING' | 'LIVE' | 'HALFTIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';

export interface LiveEvent {
  id: string;
  externalId: string; // TheSportsDB event ID
  sport: SportType;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode?: string; // e.g., "LAL", "GSW"
  awayTeamCode?: string;
  venue?: string;
  city?: string;
  country?: string;
  homeScore: number;
  awayScore: number;
  status: EventStatus;
  quarter?: string; // e.g., "Q1", "Q2", "Halftime"
  timeLeft?: string; // e.g., "8:42"
  scheduledTime: string; // ISO datetime
  startTime?: string; // ISO datetime
  endTime?: string; // ISO datetime
  season?: string; // e.g., "2024-2025"
  round?: string; // Week number or round
  checkInCount: number; // Denormalized count for trending
  betCount: number; // Number of bets linked to this event
  createdAt?: string;
  updatedAt?: string;
}

export interface EventCheckIn {
  id: string;
  userId: string;
  eventId: string;
  checkInTime: string; // ISO datetime
  checkOutTime?: string; // ISO datetime
  isActive: boolean;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export interface EventWithCheckIn {
  event: LiveEvent;
  checkIn: EventCheckIn;
  isCheckedIn: boolean;
}

// For the live game banner component
export interface LiveGameData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  quarter: string;
  timeLeft: string;
  venue: string;
  liveBetsCount: number;
}

// Props for event-related components
export interface EventBadgeProps {
  sport: SportType;
  checkInCount: number;
  size?: 'small' | 'medium' | 'large';
}

export interface EventDiscoveryModalProps {
  visible: boolean;
  onClose: () => void;
  onEventSelect: (event: LiveEvent) => void;
  currentUserId: string;
}

// API response types
export interface SportsDBEvent {
  idEvent: string;
  strEvent: string; // "Home Team vs Away Team"
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string;
  strProgress: string | null; // "Q1", "Q2", "Halftime"
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

// Helper types for filtering and sorting
export interface EventFilters {
  sport?: SportType;
  status?: EventStatus;
  dateFrom?: string;
  dateTo?: string;
  league?: string;
}

export interface EventSortOptions {
  sortBy: 'scheduledTime' | 'checkInCount' | 'betCount' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}
