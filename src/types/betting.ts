/**
 * SideBet Betting Types
 * TypeScript types for the betting platform
 */

export interface User {
  id: string;
  username: string;
  email: string;
  displayName?: string; // Friendly name for friends
  profilePictureUrl?: string; // S3 URL for profile picture
  isPublic?: boolean; // Account privacy: true = discoverable, false = private
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
  creatorName?: string; // Denormalized creator display name
  totalPot: number;
  betAmount?: number;
  odds: BetOdds;
  deadline: string;
  winningSide?: string;
  resolutionReason?: string;
  disputeWindowEndsAt?: string; // When the 48-hour dispute window closes
  isPrivate?: boolean; // Private bets only visible to invited users
  // Denormalized participant data for efficient list rendering
  sideACount: number;
  sideBCount: number;
  participantUserIds: string[];
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
  // Bet result acceptance (for early closure)
  hasAcceptedResult?: boolean; // Has participant accepted the bet outcome?
  acceptedResultAt?: string; // When they accepted the result
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
  sideAName: string; // Side A name (e.g., "Home", "Yes", "Lakers")
  sideBName: string; // Side B name (e.g., "Away", "No", "Warriors")
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

// Friend Management Types
export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUser?: User;
  toUser?: User;
  status: FriendRequestStatus;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Friendship {
  id: string;
  user1Id: string; // Lexicographically smaller ID
  user2Id: string; // Lexicographically larger ID
  user1?: User;
  user2?: User;
  createdAt: string;
}

export interface BetInvitation {
  id: string;
  betId: string;
  fromUserId: string;
  toUserId: string;
  bet?: Bet;
  fromUser?: User;
  toUser?: User;
  status: BetInvitationStatus;
  message?: string;
  invitedSide: string; // 'A' or 'B'
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

// Friend Management Enums
export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type BetInvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

// Friend Management UI Types
export interface FriendListItem {
  user: User;
  friendship: Friendship;
  mutualFriends?: number;
  lastBetTogether?: string;
}

export interface FriendRequestItem {
  request: FriendRequest;
  fromUser: User;
}

export interface BetInvitationItem {
  invitation: BetInvitation;
  bet: Bet;
  fromUser: User;
}

export interface AddFriendForm {
  searchQuery: string;
  selectedUser?: User;
  message?: string;
}

export interface ProfileEditForm {
  displayName: string;
  profilePicture?: string; // Base64 or file URI
}

// Search and Filter Types for Friends
export interface UserSearchParams {
  query: string; // Search by username, displayName, or email
  excludeIds?: string[]; // Exclude specific user IDs (current user, existing friends)
  limit?: number;
}

export interface FriendFilters {
  status?: 'all' | 'recent' | 'active'; // All friends, recently added, recently active
  searchQuery?: string;
}

// Notification system types
export type NotificationType =
  | 'FRIEND_REQUEST_RECEIVED'
  | 'FRIEND_REQUEST_ACCEPTED'
  | 'FRIEND_REQUEST_DECLINED'
  | 'BET_INVITATION_RECEIVED'
  | 'BET_INVITATION_ACCEPTED'
  | 'BET_INVITATION_DECLINED'
  | 'BET_JOINED'
  | 'BET_RESOLVED'
  | 'BET_CANCELLED'
  | 'BET_DISPUTED'
  | 'BET_DEADLINE_APPROACHING'
  | 'DEPOSIT_COMPLETED'
  | 'DEPOSIT_FAILED'
  | 'WITHDRAWAL_COMPLETED'
  | 'WITHDRAWAL_FAILED'
  | 'PAYMENT_METHOD_VERIFIED'
  | 'SYSTEM_ANNOUNCEMENT'
  | 'SQUARES_GRID_LOCKED'
  | 'SQUARES_PERIOD_WINNER'
  | 'SQUARES_GAME_LIVE'
  | 'SQUARES_GAME_CANCELLED'
  | 'SQUARES_PURCHASE_CONFIRMED'
  | 'SQUARES_INVITATION_RECEIVED'
  | 'SQUARES_INVITATION_ACCEPTED'
  | 'SQUARES_INVITATION_DECLINED';

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  priority: NotificationPriority;
  actionType?: string;
  actionData?: any;
  relatedBetId?: string;
  relatedUserId?: string;
  relatedRequestId?: string;
  createdAt: string;
}

export interface NotificationPreferences {
  id: string;
  userId: string;

  // Global notification controls
  pushEnabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;

  // Notification type preferences - grouped by category
  friendRequestsEnabled: boolean;
  betInvitationsEnabled: boolean;
  betJoinedEnabled: boolean;
  betResolvedEnabled: boolean;
  betCancelledEnabled: boolean;
  betDeadlineEnabled: boolean;
  paymentNotificationsEnabled: boolean;
  systemAnnouncementsEnabled: boolean;

  // Do Not Disturb schedule
  dndEnabled: boolean;
  dndStartHour?: number;
  dndEndHour?: number;

  createdAt: string;
  updatedAt: string;
}
// Squares Game Types
export interface SquaresInvitation {
  id: string;
  squaresGameId: string;
  fromUserId: string;
  toUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  message?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  // Relations
  squaresGame?: any;
  fromUser?: User;
  toUser?: User;
}
