import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { fetchAuthSession, getCurrentUser, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

interface User {
  userId: string;
  username: string;
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
      if (isMountedRef.current) {
        setUser({
          userId: currentUser.userId,
          username: currentUser.username,
        });
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

      if (!silent && isMountedRef.current) {
        setIsLoading(true);
      }

      try {
        const sessionValid = await ensureSession(forceRefresh);
        if (!sessionValid) {
          if (isMountedRef.current) {
            setUser(null);
          }
          return;
        }

        await checkAuthState();
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

  return (
    <AuthContext.Provider value={{ user, isLoading, signOut, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
