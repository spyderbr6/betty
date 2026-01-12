/**
 * NotificationContext
 * Real-time notification management using GraphQL subscriptions
 * Eliminates polling by subscribing to notification create/update events
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationService } from '../services/notificationService';
import ToastNotificationService from '../services/toastNotificationService';
import { useAuth } from './AuthContext';

const client = generateClient<Schema>();

interface NotificationContextType {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const isMountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  const subscriptionsRef = useRef<{ onCreate?: any; onUpdate?: any }>({});

  /**
   * Fetch current unread count from database
   */
  const refreshUnreadCount = useCallback(async () => {
    if (!user?.userId) {
      setUnreadCount(0);
      return;
    }

    try {
      const count = await NotificationService.getUnreadCount(user.userId);
      if (isMountedRef.current) {
        setUnreadCount(count);
      }
    } catch (error) {
      console.error('[NotificationContext] Error fetching unread count:', error);
    }
  }, [user?.userId]);

  /**
   * Mark a single notification as read and update count
   */
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await NotificationService.markAsRead(notificationId);
      // Optimistically decrement count
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('[NotificationContext] Error marking notification as read:', error);
      // Refresh to get accurate count on error
      await refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

  /**
   * Mark all notifications as read and reset count
   */
  const markAllAsRead = useCallback(async () => {
    if (!user?.userId) return;

    try {
      await NotificationService.markAllAsRead(user.userId);
      setUnreadCount(0);
    } catch (error) {
      console.error('[NotificationContext] Error marking all as read:', error);
      // Refresh to get accurate count on error
      await refreshUnreadCount();
    }
  }, [user?.userId, refreshUnreadCount]);

  /**
   * Setup GraphQL subscriptions for real-time notification updates
   */
  useEffect(() => {
    if (!user?.userId) {
      // Clear subscriptions when user logs out
      if (subscriptionsRef.current.onCreate) {
        subscriptionsRef.current.onCreate.unsubscribe();
        subscriptionsRef.current.onCreate = undefined;
      }
      if (subscriptionsRef.current.onUpdate) {
        subscriptionsRef.current.onUpdate.unsubscribe();
        subscriptionsRef.current.onUpdate = undefined;
      }
      setUnreadCount(0);
      return;
    }

    console.log('[NotificationContext] Setting up GraphQL subscriptions for user:', user.userId);

    // Initial count fetch
    refreshUnreadCount();

    // Subscribe to new notifications (onCreate)
    const createSubscription = client.models.Notification.onCreate({
      filter: {
        userId: { eq: user.userId }
      }
    }).subscribe({
      next: (notification) => {
        console.log('[NotificationContext] New notification received:', notification);
        // Only increment if notification is unread
        if (!notification.isRead) {
          setUnreadCount(prev => prev + 1);
        }

        // Show in-app toast for new notifications (from Lambda or other sources)
        if (notification.priority !== 'LOW') {
          try {
            // Parse actionData if it's a JSON string
            let parsedActionData = notification.actionData;
            if (typeof notification.actionData === 'string') {
              try {
                parsedActionData = JSON.parse(notification.actionData);
              } catch {
                // If parsing fails, use as-is
              }
            }

            // Show toast
            ToastNotificationService.showToast(
              notification.type,
              notification.title,
              notification.message,
              notification.priority,
              parsedActionData
            );
          } catch (toastError) {
            console.warn('[NotificationContext] Failed to show toast for new notification:', toastError);
          }
        }
      },
      error: (error) => {
        console.error('[NotificationContext] onCreate subscription error:', error);
        // Fall back to fetching count on error
        refreshUnreadCount();
      }
    });

    // Subscribe to notification updates (onUpdate) - for when notifications are marked as read
    const updateSubscription = client.models.Notification.onUpdate({
      filter: {
        userId: { eq: user.userId }
      }
    }).subscribe({
      next: (notification) => {
        console.log('[NotificationContext] Notification updated:', notification);
        // If notification was marked as read, decrement count
        if (notification.isRead) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        } else {
          // If somehow marked as unread again, increment
          setUnreadCount(prev => prev + 1);
        }
      },
      error: (error) => {
        console.error('[NotificationContext] onUpdate subscription error:', error);
        // Fall back to fetching count on error
        refreshUnreadCount();
      }
    });

    subscriptionsRef.current.onCreate = createSubscription;
    subscriptionsRef.current.onUpdate = updateSubscription;

    // Cleanup subscriptions on unmount or user change
    return () => {
      console.log('[NotificationContext] Cleaning up subscriptions');
      createSubscription.unsubscribe();
      updateSubscription.unsubscribe();
      subscriptionsRef.current.onCreate = undefined;
      subscriptionsRef.current.onUpdate = undefined;
    };
  }, [user?.userId, refreshUnreadCount]);

  /**
   * Handle app state changes (foreground/background)
   * Refresh count when app comes to foreground
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      // When app comes to foreground, refresh count to ensure accuracy
      if (previousState.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[NotificationContext] App foregrounded - refreshing unread count');
        refreshUnreadCount();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshUnreadCount]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const value: NotificationContextType = {
    unreadCount,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
