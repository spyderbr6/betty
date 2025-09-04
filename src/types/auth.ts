/**
 * SideBet Auth Types
 * TypeScript types for authentication
 */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified?: boolean;
  createdAt: string;
  updatedAt: string;
  // Custom attributes from Cognito
  trustScore?: number;
  totalBets?: number;
  winRate?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export interface VerificationData {
  email: string;
  code: string;
}

export interface ResetPasswordData {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export interface AuthContextType {
  // State
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  
  // Actions
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signUp: (credentials: SignUpCredentials) => Promise<void>;
  verifyEmail: (data: VerificationData) => Promise<void>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (data: ResetPasswordData) => Promise<void>;
  changePassword: (data: ChangePasswordData) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

// Form validation types
export interface FormErrors {
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
  general?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: FormErrors;
}

// Auth flow states
export type AuthFlow = 
  | 'signIn' 
  | 'signUp' 
  | 'verification' 
  | 'forgotPassword' 
  | 'resetPassword'
  | 'changePassword';

// Session information
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
}

// Biometric auth (for future implementation)
export interface BiometricConfig {
  enabled: boolean;
  type: 'fingerprint' | 'face' | 'none';
  title: string;
  subtitle: string;
  fallbackLabel: string;
}

// Social auth (for future implementation)
export interface SocialAuthProvider {
  name: 'google' | 'apple' | 'facebook';
  enabled: boolean;
  clientId?: string;
}

// Auth error types
export interface AuthError {
  code: string;
  message: string;
  details?: any;
}

// Common auth error codes
export const AUTH_ERRORS = {
  USER_NOT_FOUND: 'UserNotFoundException',
  INVALID_PASSWORD: 'NotAuthorizedException',
  USER_NOT_CONFIRMED: 'UserNotConfirmedException',
  INVALID_VERIFICATION_CODE: 'CodeMismatchException',
  CODE_EXPIRED: 'ExpiredCodeException',
  TOO_MANY_REQUESTS: 'TooManyRequestsException',
  WEAK_PASSWORD: 'InvalidPasswordException',
  USERNAME_EXISTS: 'UsernameExistsException',
  EMAIL_EXISTS: 'AliasExistsException',
  NETWORK_ERROR: 'NetworkError',
  UNKNOWN_ERROR: 'UnknownError',
} as const;

// User preferences
export interface UserPreferences {
  notifications: {
    betUpdates: boolean;
    betResolutions: boolean;
    newChallenges: boolean;
    marketing: boolean;
  };
  privacy: {
    showProfile: boolean;
    showStats: boolean;
    allowFriendRequests: boolean;
  };
  display: {
    theme: 'dark' | 'light';
    currency: 'USD' | 'EUR' | 'GBP';
    oddsFormat: 'american' | 'decimal' | 'fractional';
  };
}