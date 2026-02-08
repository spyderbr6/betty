import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { fetchAuthSession, getCurrentUser, fetchUserAttributes, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationService } from '../services/notificationService';
import { NotificationPreferencesService } from '../services/notificationPreferencesService';
import { initializePushNotifications, addNotificationResponseListener, removeNotificationResponseListener } from '../services/pushNotificationConfig';
import { CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION } from '../constants/policies';
import type { Subscription } from 'expo-notifications';

const client = generateClient<Schema>();

type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

interface User {
  userId: string;
  username: string;
  displayName?: string;
  role: UserRole;
  onboardingCompleted: boolean;
  onboardingStep: number;
  profilePictureUrl?: string;
}

interface RefreshOptions {
  forceRefresh?: boolean;
  silent?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshAuth: (options?: RefreshOptions) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  const notificationSubscriptionRef = useRef<Subscription | null>(null);

  const ensureSession = useCallback(async (forceRefresh = false): Promise<boolean> => {
    try {
      await fetchAuthSession({ forceRefresh });
      return true;
    } catch (error) {
      if (!forceRefresh) {
        try {
          await fetchAuthSession({ forceRefresh: true });
          return true;
        } catch (refreshError) {
          console.warn('Failed to force refresh auth session:', refreshError);
        }
      } else {
        console.warn('Failed to fetch auth session:', error);
      }
      return false;
    }
  }, []);

  const checkAuthState = useCallback(async (): Promise<boolean> => {
    try {
      const currentUser = await getCurrentUser();

      console.log('[AuthContext] Cognito user:', {
        userId: currentUser.userId,
        username: currentUser.username,
      });

      // Fetch user data from database to get role and onboarding status
      let { data: userData } = await client.models.User.get({ id: currentUser.userId });

      console.log('[AuthContext] Raw database query result:', {
        queryId: currentUser.userId,
        userData_id: userData?.id,
        userData_username: userData?.username,
        userData_displayName: userData?.displayName,
        userData_email: userData?.email,
      });

      // Create User record if it doesn't exist (first login after signup)
      if (!userData) {
        console.log('[AuthContext] No User record found, creating one for:', currentUser.userId);

        // Fetch Cognito attributes for display name and email
        let displayNameFromCognito = '';
        let realEmail = currentUser.username;
        try {
          const userAttributes = await fetchUserAttributes();
          displayNameFromCognito = userAttributes.name || '';
          realEmail = userAttributes.email || currentUser.username;
        } catch (attrError) {
          console.warn('[AuthContext] Could not fetch Cognito user attributes:', attrError);
        }

        const currentTime = new Date().toISOString();
        const createResult = await client.models.User.create({
          id: currentUser.userId,
          username: currentUser.username,
          email: realEmail,
          displayName: displayNameFromCognito || undefined,
          displayNameLower: displayNameFromCognito ? displayNameFromCognito.toLowerCase() : undefined,
          balance: 0,
          trustScore: 5.0,
          totalBets: 0,
          totalWinnings: 0,
          winRate: 0,
          tosAccepted: true,
          tosAcceptedAt: currentTime,
          tosVersion: CURRENT_TOS_VERSION,
          privacyPolicyAccepted: true,
          privacyPolicyAcceptedAt: currentTime,
          privacyPolicyVersion: CURRENT_PRIVACY_VERSION,
        });

        if (createResult.data) {
          userData = createResult.data;
          console.log('[AuthContext] User record created successfully');

          // Create default notification preferences for new user
          try {
            await NotificationPreferencesService.createDefaultPreferences(createResult.data.id!);
          } catch (prefError) {
            console.warn('[AuthContext] Failed to create notification preferences:', prefError);
          }
        }
      }

      if (isMountedRef.current) {
        // Debug: Check what we're loading from database
        console.log('[AuthContext] Loading user data:', {
          currentUser_userId: currentUser.userId,
          currentUser_username: currentUser.username,
          userData_displayName: userData?.displayName,
          userData_username: userData?.username,
        });

        const newUser = {
          userId: currentUser.userId,
          username: currentUser.username,
          displayName: userData?.displayName ?? undefined,
          role: (userData?.role as UserRole) || 'USER',
          onboardingCompleted: userData?.onboardingCompleted ?? false,
          onboardingStep: userData?.onboardingStep ?? 0,
          profilePictureUrl: userData?.profilePictureUrl ?? undefined,
        };

        console.log('[AuthContext] Created user object:', newUser);
        setUser(newUser);

        // Register push token when user is authenticated
        try {
          await NotificationService.registerPushToken(currentUser.userId);
        } catch (pushError) {
          console.warn('Failed to register push token:', pushError);
        }
      }
      return true;
    } catch (error) {
      if (isMountedRef.current) {
        setUser(null);
      }
      return false;
    }
  }, []);

  const refreshAuth = useCallback(
    async (options?: RefreshOptions) => {
      const silent = options?.silent ?? false;
      const forceRefresh = options?.forceRefresh ?? false;

      console.log('[AuthContext] refreshAuth called:', { silent, forceRefresh });

      if (!silent && isMountedRef.current) {
        setIsLoading(true);
      }

      try {
        const sessionValid = await ensureSession(forceRefresh);
        if (!sessionValid) {
          console.log('[AuthContext] refreshAuth: Session invalid, clearing user');
          if (isMountedRef.current) {
            setUser(null);
          }
          return;
        }

        console.log('[AuthContext] refreshAuth: Calling checkAuthState...');
        await checkAuthState();
        console.log('[AuthContext] refreshAuth: checkAuthState completed');
      } catch (error) {
        console.error('Error refreshing auth state:', error);
        if (isMountedRef.current) {
          setUser(null);
        }
      } finally {
        if (!silent && isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [checkAuthState, ensureSession]
  );

  useEffect(() => {
    // Initialize push notifications on app start
    initializePushNotifications().catch((error) => {
      console.warn('Failed to initialize push notifications:', error);
    });

    // Add notification response listener
    notificationSubscriptionRef.current = addNotificationResponseListener();

    refreshAuth().catch((error) => {
      console.error('Error during initial auth refresh:', error);
    });

    const removeHubListener = Hub.listen('auth', ({ payload }) => {
      const eventName = payload?.event as string | undefined;
      if (!eventName) {
        return;
      }

      if (eventName === 'signedIn' || eventName === 'tokenRefresh') {
        refreshAuth({ silent: true }).catch((error) => {
          console.error('Error handling auth hub refresh:', error);
        });
      }

      if (eventName === 'signedOut' || eventName === 'tokenRefresh_failure' || eventName === 'sessionExpired') {
        if (isMountedRef.current) {
          setUser(null);
        }
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (
        typeof previousState === 'string' &&
        previousState.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        refreshAuth({ silent: true }).catch((error) => {
          console.error('Error refreshing auth on resume:', error);
        });
      }
    });

    return () => {
      isMountedRef.current = false;
      removeHubListener();
      appStateSubscription.remove();

      // Remove notification listener
      if (notificationSubscriptionRef.current) {
        removeNotificationResponseListener(notificationSubscriptionRef.current);
      }
    };
  }, [refreshAuth]);

  const signOut = useCallback(async () => {
    try {
      await amplifySignOut();
      if (isMountedRef.current) {
        setUser(null);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  // Debug: Log what's being provided to context consumers
  console.log('[AuthContext] Provider rendering with user:', user ? {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  } : null);

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
