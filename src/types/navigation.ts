/**
 * SideBet Navigation Types
 * TypeScript types for React Navigation
 */

import { Bet, User } from './betting';

// Root Stack Navigator (handles auth flow)
export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

// Auth Stack Navigator (login, signup, verification)
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  Verification: {
    email: string;
  };
  ForgotPassword: undefined;
};

// Main App Tab Navigator (bottom navigation)
export type AppTabParamList = {
  Bets: undefined;
  Live: undefined;
  Create: undefined;
  Resolve: undefined;
  Account: undefined;
};

// Bets Stack Navigator (main betting screens)
export type BetsStackParamList = {
  BetsList: undefined;
  BetDetails: {
    betId: string;
  };
  JoinBet: {
    bet: Bet;
  };
  UserProfile: {
    userId: string;
  };
};

// Live Stack Navigator (live betting screens)
export type LiveStackParamList = {
  LiveEvents: undefined;
  LiveBetDetails: {
    betId: string;
  };
  LocationSearch: undefined;
};

// Create Stack Navigator (bet creation flow)
export type CreateStackParamList = {
  CreateBet: undefined;
  BetPreview: {
    betData: any; // Will be refined
  };
  BetSuccess: {
    betId: string;
  };
};

// Resolve Stack Navigator (bet resolution screens)
export type ResolveStackParamList = {
  ResolutionList: undefined;
  ResolveBet: {
    betId: string;
  };
  SubmitEvidence: {
    betId: string;
  };
  DisputeResolution: {
    betId: string;
  };
};

// Account Stack Navigator (user profile and settings)
export type AccountStackParamList = {
  Profile: undefined;
  Settings: undefined;
  Stats: undefined;
  History: undefined;
  Support: undefined;
  About: undefined;
};

// Modal Stack Navigator (for modals that overlay main navigation)
export type ModalStackParamList = {
  QRScanner: undefined;
  BetQR: {
    betId: string;
  };
  DepositFunds: undefined;
  WithdrawFunds: undefined;
  BetFilter: {
    currentFilters?: any;
    onApplyFilters: (filters: any) => void;
  };
  UserStatsModal: {
    user: User;
  };
};

// Combined navigation types for type safety
export type AllParamList = RootStackParamList & 
  AuthStackParamList & 
  AppTabParamList & 
  BetsStackParamList & 
  LiveStackParamList & 
  CreateStackParamList & 
  ResolveStackParamList & 
  AccountStackParamList & 
  ModalStackParamList;

// Screen names as constants
export const SCREENS = {
  // Root
  AUTH: 'Auth' as const,
  APP: 'App' as const,
  
  // Auth
  LOGIN: 'Login' as const,
  SIGNUP: 'SignUp' as const,
  VERIFICATION: 'Verification' as const,
  FORGOT_PASSWORD: 'ForgotPassword' as const,
  
  // Main Tabs
  BETS: 'Bets' as const,
  LIVE: 'Live' as const,
  CREATE: 'Create' as const,
  RESOLVE: 'Resolve' as const,
  ACCOUNT: 'Account' as const,
  
  // Betting
  BETS_LIST: 'BetsList' as const,
  BET_DETAILS: 'BetDetails' as const,
  JOIN_BET: 'JoinBet' as const,
  USER_PROFILE: 'UserProfile' as const,
  
  // Live
  LIVE_EVENTS: 'LiveEvents' as const,
  LIVE_BET_DETAILS: 'LiveBetDetails' as const,
  LOCATION_SEARCH: 'LocationSearch' as const,
  
  // Create
  CREATE_BET: 'CreateBet' as const,
  BET_PREVIEW: 'BetPreview' as const,
  BET_SUCCESS: 'BetSuccess' as const,
  
  // Resolve
  RESOLUTION_LIST: 'ResolutionList' as const,
  RESOLVE_BET: 'ResolveBet' as const,
  SUBMIT_EVIDENCE: 'SubmitEvidence' as const,
  DISPUTE_RESOLUTION: 'DisputeResolution' as const,
  
  // Account
  PROFILE: 'Profile' as const,
  SETTINGS: 'Settings' as const,
  STATS: 'Stats' as const,
  HISTORY: 'History' as const,
  SUPPORT: 'Support' as const,
  ABOUT: 'About' as const,
  
  // Modals
  QR_SCANNER: 'QRScanner' as const,
  BET_QR: 'BetQR' as const,
  DEPOSIT_FUNDS: 'DepositFunds' as const,
  WITHDRAW_FUNDS: 'WithdrawFunds' as const,
  BET_FILTER: 'BetFilter' as const,
  USER_STATS_MODAL: 'UserStatsModal' as const,
} as const;

// Tab bar configuration
export interface TabBarConfig {
  name: keyof AppTabParamList;
  label: string;
  icon: string; // Will use Expo Vector Icons
  activeIcon?: string;
}

export const TAB_CONFIG: TabBarConfig[] = [
  {
    name: 'Bets',
    label: 'Bets',
    icon: 'list',
    activeIcon: 'list',
  },
  {
    name: 'Live',
    label: 'Live',
    icon: 'radio-button-on',
    activeIcon: 'radio-button-on',
  },
  {
    name: 'Create',
    label: 'Create',
    icon: 'add-circle-outline',
    activeIcon: 'add-circle',
  },
  {
    name: 'Resolve',
    label: 'Resolve',
    icon: 'checkmark-circle-outline',
    activeIcon: 'checkmark-circle',
  },
  {
    name: 'Account',
    label: 'Account',
    icon: 'person-outline',
    activeIcon: 'person',
  },
];