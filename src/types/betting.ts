/**
 * SideBet Betting Types
 * TypeScript types for the betting platform
 */

export interface User {
  id: string;
  username: string;
  email: string;
  balance: number;
  trustScore: number;
  totalBets: number;
  totalWinnings: number;
  winRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface Bet {
  id: string;
  title: string;
  description: string;
  category: BetCategory;
  status: BetStatus;
  creatorId: string;
  creator?: User;
  totalPot: number;
  odds: BetOdds;
  deadline: string;
  winningSide?: string;
  resolutionReason?: string;
  createdAt: string;
  updatedAt: string;
  participants?: Participant[];
  evidence?: Evidence[];
}

export interface Participant {
  id: string;
  betId: string;
  userId: string;
  user?: User;
  side: string; // 'A', 'B', or custom side name
  amount: number;
  status: ParticipantStatus;
  payout: number;
  joinedAt: string;
}

export interface Evidence {
  id: string;
  betId: string;
  submittedBy: string;
  type: EvidenceType;
  url?: string;
  description?: string;
  timestamp: string;
}

export interface UserStats {
  id: string;
  userId: string;
  period: StatsPeriod;
  betsWon: number;
  betsLost: number;
  totalProfit: number;
  biggestWin: number;
  winStreak: number;
  updatedAt: string;
}

// Enums
export type BetCategory = 'SPORTS' | 'ENTERTAINMENT' | 'WEATHER' | 'STOCKS' | 'CUSTOM';

export type BetStatus = 
  | 'DRAFT' 
  | 'ACTIVE' 
  | 'LIVE' 
  | 'PENDING_RESOLUTION' 
  | 'DISPUTED' 
  | 'RESOLVED' 
  | 'CANCELLED';

export type ParticipantStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export type EvidenceType = 'PHOTO' | 'VIDEO' | 'SCREENSHOT' | 'TEXT';

export type StatsPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME';

// Betting-specific types
export interface BetOdds {
  sideA: number; // American odds format (-110, +150)
  sideB: number;
  sideAName?: string; // Custom side names
  sideBName?: string;
}

export interface BetSide {
  name: string;
  odds: number;
  participants: number;
  totalAmount: number;
}

// UI-specific types
export interface BetCardProps {
  bet: Bet;
  onPress?: (bet: Bet) => void;
  showParticipants?: boolean;
}

export interface CreateBetForm {
  title: string;
  description: string;
  category: BetCategory;
  sideAName: string;
  sideBName: string;
  sideAOdds: number;
  sideBOdds: number;
  deadline: Date;
  initialAmount: number;
  initialSide: string;
}

export interface JoinBetForm {
  betId: string;
  side: string;
  amount: number;
}

// Filter and search types
export interface BetFilters {
  status?: BetStatus[];
  category?: BetCategory[];
  minPot?: number;
  maxPot?: number;
  createdBy?: 'me' | 'others' | 'all';
  participatedBy?: 'me' | 'others' | 'all';
}

export interface BetSearchParams {
  query?: string;
  filters?: BetFilters;
  sortBy?: 'created' | 'deadline' | 'pot' | 'activity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Statistics types
export interface UserStatsDisplay {
  winRate: number;
  totalBets: number;
  trustScore: number;
  totalProfit: number;
  currentStreak: number;
  favoriteCategory: BetCategory;
}

export interface BetAnalytics {
  totalActiveBets: number;
  totalLiveBets: number;
  totalUsers: number;
  totalVolume: number;
  popularCategories: Array<{
    category: BetCategory;
    count: number;
  }>;
}