/**
 * Notification Service
 * Centralized service for creating and managing notifications
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationType, NotificationPriority, Notification } from '../types/betting';
import * as Notifications from 'expo-notifications';
import { getCurrentUser } from 'aws-amplify/auth';
// Temporarily remove Device import to avoid native module issues
// import * as Device from 'expo-device';
// Removed Constants import to avoid dependency issues
// import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { NotificationPreferencesService } from './notificationPreferencesService';
import ToastNotificationService from './toastNotificationService';
import { subscribeToWebPush, isWebPushSupported, unsubscribeFromWebPush } from '../utils/webPushUtils';

const client = generateClient<Schema>();

export class NotificationService {
  /**
   * Register push token for user (platform-aware: Expo for mobile, Web Push for web)
   */
  static async registerPushToken(userId: string): Promise<string | null> {
    try {
      // WEB PLATFORM: Use Web Push API
      if (Platform.OS === 'web') {
        console.log('[Push] Registering web push token...');

        if (!isWebPushSupported()) {
          console.log('[Push] Web push not supported in this browser');
          return null;
        }

        try {
          // Subscribe to web push notifications
          const webPushSubscription = await subscribeToWebPush();

          // Store the subscription in database
          await client.models.PushToken.create({
            userId,
            token: webPushSubscription,
            platform: 'WEB',
            deviceId: `web-${navigator.userAgent.substring(0, 50)}`,
            appVersion: '1.0.0',
            isActive: true,
            lastUsed: new Date().toISOString(),
          });

          console.log('[Push] Web push token registered successfully');
          return webPushSubscription;
        } catch (webError) {
          console.error('[Push] Web push registration failed:', webError);
          return null;
        }
      }

      // MOBILE PLATFORMS: Use Expo Push Notifications
      console.log('[Push] Registering Expo push token...');

      // Check if push notifications are supported in this environment
      if (!Notifications.getExpoPushTokenAsync) {
        console.log('[Push] Notifications not supported in this environment');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[Push] Permission not granted for push notifications');
        return null;
      }

      // Try to get expo push token with proper project ID
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'f26fa72b-c85a-4174-90bb-1b14c526ed05' // EAS project ID from app.json
      });

      // Store the token in database
      const deviceId = Platform.OS === 'ios' ? 'iOS-Device' : 'Android-Device';
      const platform = Platform.OS.toUpperCase() as 'IOS' | 'ANDROID';

      await client.models.PushToken.create({
        userId,
        token: token.data,
        platform,
        deviceId,
        appVersion: '1.0.0', // Simplified to avoid Constants dependency issues
        isActive: true,
        lastUsed: new Date().toISOString(),
      });

      console.log('[Push] Token registered successfully:', token.data);
      return token.data;
    } catch (error: any) {
      // Handle Firebase initialization error specifically
      if (error?.code === 'E_REGISTRATION_FAILED') {
        console.warn('[Push] Firebase not configured. Push notifications require Firebase setup for Android.');
        console.warn('[Push] For development: in-app notifications will still work');
        console.warn('[Push] To enable push: Follow guide at https://docs.expo.dev/push-notifications/fcm-credentials/');
      } else {
        console.error('[Push] Error registering push token:', error);
      }
      return null;
    }
  }

  /**
   * Unregister push token for user (platform-aware)
   */
  static async unregisterPushToken(userId: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // Unsubscribe from web push
        await unsubscribeFromWebPush();
        console.log('[Push] Web push unsubscribed');
      }

      // Deactivate tokens in database
      const { data: tokens } = await client.models.PushToken.list({
        filter: {
          userId: { eq: userId },
          isActive: { eq: true }
        }
      });

      if (tokens && tokens.length > 0) {
        await Promise.all(
          tokens.map(token =>
            client.models.PushToken.update({
              id: token.id!,
              isActive: false,
            })
          )
        );
        console.log(`[Push] Deactivated ${tokens.length} push tokens`);
      }
    } catch (error) {
      console.error('[Push] Error unregistering push token:', error);
    }
  }

  /**
   * Send push notification to user via Lambda function
   */
  static async sendPushNotification(
    userId: string,
    title: string,
    message: string,
    data?: any,
    priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
  ): Promise<boolean> {
    try {
      const { data: result } = await client.mutations.sendPushNotification({
        userId,
        title,
        message,
        data,
        priority,
      });

      console.log(`Push notification sent to ${userId}:`, result);
      return result || false;
    } catch (error) {
      console.error('Error sending push notification:', error);
      return false;
    }
  }

  /**
   * Cleanup inactive push tokens
   */
  static async cleanupInactiveTokens(userId: string, daysInactive: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

      const { data: inactiveTokens } = await client.models.PushToken.list({
        filter: {
          userId: { eq: userId },
          lastUsed: { lt: cutoffDate.toISOString() }
        }
      });

      if (inactiveTokens && inactiveTokens.length > 0) {
        await Promise.all(
          inactiveTokens.map(token =>
            client.models.PushToken.update({
              id: token.id!,
              isActive: false,
            })
          )
        );
        console.log(`Deactivated ${inactiveTokens.length} inactive push tokens`);
      }
    } catch (error) {
      console.error('Error cleaning up inactive tokens:', error);
    }
  }

  /**
   * Create a new notification for a user
   */
  static async createNotification({
    userId,
    type,
    title,
    message,
    priority = 'MEDIUM',
    actionType,
    actionData,
    relatedBetId,
    relatedUserId,
    relatedRequestId,
    sendPush = true,
  }: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    priority?: NotificationPriority;
    actionType?: string;
    actionData?: any;
    relatedBetId?: string;
    relatedUserId?: string;
    relatedRequestId?: string;
    sendPush?: boolean;
  }): Promise<Notification | null> {
    try {
      console.log('[Notification] Creating notification:', { userId, type, title, message, priority });

      // Check if user has this notification type enabled
      const isEnabled = await NotificationPreferencesService.isNotificationEnabled(userId, type);
      if (!isEnabled) {
        console.log(`[Notification] User ${userId} has ${type} notifications disabled - skipping`);
        return null;
      }

      // Get user preferences to check DND and delivery methods
      const preferences = await NotificationPreferencesService.getUserPreferences(userId);

      // Check if in Do Not Disturb window
      const inDndWindow = NotificationPreferencesService.isInDndWindow(preferences);
      if (inDndWindow) {
        console.log(`[Notification] User ${userId} is in DND window - creating DB record but no push/in-app`);
        sendPush = false;
        // Note: in-app notifications will also be skipped (we'll add this feature in Phase 4)
      }

      console.log('[Notification] Full params:', {
        userId, type, title, message, priority, actionType, actionData,
        relatedBetId, relatedUserId, relatedRequestId
      });

      const result = await client.models.Notification.create({
        userId,
        type,
        title,
        message,
        isRead: false,
        priority,
        actionType,
        actionData: actionData ? JSON.stringify(actionData) : undefined,
        relatedBetId,
        relatedUserId,
        relatedRequestId,
      });

      console.log('[Notification] Create result:', result);
      console.log('[Notification] Result data:', result.data);
      console.log('[Notification] Result errors:', result.errors);

      const { data } = result;

      if (data) {
        console.log('[Notification] Notification created successfully:', data.id);

        const notification: Notification = {
          id: data.id!,
          userId: data.userId!,
          type: data.type as NotificationType,
          title: data.title!,
          message: data.message!,
          isRead: data.isRead || false,
          priority: data.priority as NotificationPriority,
          actionType: data.actionType || undefined,
          actionData: data.actionData,
          relatedBetId: data.relatedBetId || undefined,
          relatedUserId: data.relatedUserId || undefined,
          relatedRequestId: data.relatedRequestId || undefined,
          createdAt: data.createdAt || new Date().toISOString(),
        };

        // Send push notification if:
        // 1. User wants push notifications (preferences.pushEnabled)
        // 2. Not in DND window
        // 3. High/Urgent priority
        // 4. sendPush parameter is true
        if (sendPush && preferences.pushEnabled && (priority === 'HIGH' || priority === 'URGENT')) {
          console.log('[Notification] Sending push notification...');
          try {
            await this.sendPushNotification(
              userId,
              title,
              message,
              {
                notificationId: notification.id,
                type,
                actionType,
                actionData,
                relatedBetId,
                relatedUserId,
              },
              priority === 'URGENT' ? 'HIGH' : 'MEDIUM'
            );
          } catch (pushError) {
            console.warn('[Notification] Push notification failed, but in-app notification was created:', pushError);
            // Don't fail the whole notification creation if push fails
          }
        } else {
          console.log('[Notification] Skipping push notification:', {
            sendPush,
            pushEnabled: preferences.pushEnabled,
            priority,
            inDndWindow
          });
        }

        // Show in-app toast if:
        // 1. User wants in-app notifications (preferences.inAppEnabled)
        // 2. Not in DND window
        // 3. Not LOW priority (LOW = DB record only)
        // 4. Notification is for the currently logged-in user
        if (preferences.inAppEnabled && !inDndWindow && priority !== 'LOW') {
          console.log('[Notification] Checking if should show in-app toast...');
          try {
            // Only show toast if notification is for the current logged-in user
            const currentUser = await getCurrentUser();
            if (currentUser.userId === userId) {
              console.log('[Notification] Showing in-app toast for current user');
              await ToastNotificationService.showToast(
                type,
                title,
                message,
                priority,
                {
                  notificationId: notification.id,
                  actionType,
                  actionData,
                  relatedBetId,
                  relatedUserId,
                }
              );
            } else {
              console.log('[Notification] Skipping toast - notification is for different user:', {
                notificationUserId: userId,
                currentUserId: currentUser.userId
              });
            }
          } catch (toastError) {
            console.warn('[Notification] In-app toast failed:', toastError);
            // Don't fail the whole notification creation if toast fails
          }
        } else {
          console.log('[Notification] Skipping in-app toast:', {
            inAppEnabled: preferences.inAppEnabled,
            inDndWindow,
            priority
          });
        }

        return notification;
      }
      console.warn('[Notification] No data returned from create operation');
      return null;
    } catch (error) {
      console.error('[Notification] Error creating notification:', error);
      return null;
    }
  }

  /**
   * Get notifications for a user
   * Uses efficient GSI query for unread notifications (no scanning/filtering needed)
   */
  static async getUserNotifications(
    userId: string,
    options: {
      unreadOnly?: boolean;
      limit?: number;
      type?: NotificationType;
    } = {}
  ): Promise<Notification[]> {
    try {
      const requestedLimit = options.limit || 50;

      console.log(`[Notification] Fetching notifications for user ${userId}, unreadOnly: ${options.unreadOnly}, limit: ${requestedLimit}`);

      let data: any[] = [];

      // Use efficient GSI query by userId (returns date-ordered results)
      // Then filter by isRead client-side (efficient for typical notification volumes)
      if (options.unreadOnly) {
        console.log(`[Notification] Using GSI query for user notifications (will filter isRead client-side)`);
        const response: any = await client.models.Notification.notificationsByUser({
          userId: userId
        }, {
          limit: requestedLimit * 2, // Fetch extra to account for client-side filtering
          sortDirection: 'DESC' // Sort by createdAt descending (newest first)
        });
        data = response.data || [];
        // Filter for unread notifications client-side
        data = data.filter((n: any) => n.isRead === false);
        console.log(`[Notification] GSI query returned ${data.length} unread notifications after filtering`);
      } else {
        // For all notifications (read + unread), use efficient GSI query
        console.log(`[Notification] Using GSI query for all user notifications`);
        const response: any = await client.models.Notification.notificationsByUser({
          userId: userId
        }, {
          limit: requestedLimit,
          sortDirection: 'DESC' // Newest first
        });
        data = response.data || [];
        console.log(`[Notification] GSI query returned ${data.length} notifications`);
      }

      // Apply type filter client-side if specified
      if (options.type) {
        data = data.filter(n => n.type === options.type);
      }

      // Map notifications (already sorted by GSI createdAt DESC)
      const mapped = data
        .map(notification => ({
          id: notification.id!,
          userId: notification.userId!,
          type: notification.type as NotificationType,
          title: notification.title!,
          message: notification.message!,
          isRead: notification.isRead || false,
          priority: notification.priority as NotificationPriority,
          actionType: notification.actionType || undefined,
          actionData: notification.actionData,
          relatedBetId: notification.relatedBetId || undefined,
          relatedUserId: notification.relatedUserId || undefined,
          relatedRequestId: notification.relatedRequestId || undefined,
          createdAt: notification.createdAt || new Date().toISOString(),
        }))
        .slice(0, requestedLimit); // Limit to exact requested amount

      console.log(`[Notification] Returning ${mapped.length} notifications`);
      return mapped;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string): Promise<boolean> {
    try {
      await client.models.Notification.update({
        id: notificationId,
        isRead: true,
      });
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const notifications = await this.getUserNotifications(userId, { unreadOnly: true });

      await Promise.all(
        notifications.map(notification =>
          client.models.Notification.update({
            id: notification.id,
            isRead: true,
          })
        )
      );

      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userId: string): Promise<number> {
    try {
      const notifications = await this.getUserNotifications(userId, { unreadOnly: true });
      console.log(`[Notification] Unread count for user ${userId}:`, notifications.length);
      return notifications.length;
    } catch (error) {
      console.error('[Notification] Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Delete old notifications (cleanup)
   */
  static async deleteOldNotifications(userId: string, daysOld: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data } = await client.models.Notification.list({
        filter: {
          userId: { eq: userId },
          createdAt: { lt: cutoffDate.toISOString() }
        }
      });

      if (data && data.length > 0) {
        await Promise.all(
          data.map(notification =>
            client.models.Notification.delete({ id: notification.id! })
          )
        );
      }
    } catch (error) {
      console.error('Error deleting old notifications:', error);
    }
  }

  // Convenience methods for common notification types

  /**
   * Friend Request Received
   */
  static async notifyFriendRequestReceived(
    toUserId: string,
    fromUserDisplayName: string,
    fromUserId: string,
    requestId: string
  ): Promise<void> {
    await this.createNotification({
      userId: toUserId,
      type: 'FRIEND_REQUEST_RECEIVED',
      title: 'New Friend Request',
      message: `${fromUserDisplayName} sent you a friend request`,
      priority: 'MEDIUM',
      actionType: 'view_friend_requests',
      relatedUserId: fromUserId,
      relatedRequestId: requestId,
    });
  }

  /**
   * Friend Request Accepted
   */
  static async notifyFriendRequestAccepted(
    toUserId: string,
    accepterDisplayName: string,
    accepterUserId: string
  ): Promise<void> {
    await this.createNotification({
      userId: toUserId,
      type: 'FRIEND_REQUEST_ACCEPTED',
      title: 'Friend Request Accepted',
      message: `${accepterDisplayName} accepted your friend request!`,
      priority: 'MEDIUM',
      actionType: 'view_friends',
      relatedUserId: accepterUserId,
    });
  }

  /**
   * Bet Invitation Received
   */
  static async notifyBetInvitationReceived(
    toUserId: string,
    fromUserDisplayName: string,
    betTitle: string,
    fromUserId: string,
    betId: string,
    invitationId: string
  ): Promise<void> {
    await this.createNotification({
      userId: toUserId,
      type: 'BET_INVITATION_RECEIVED',
      title: 'Bet Invitation',
      message: `${fromUserDisplayName} invited you to bet on "${betTitle}"`,
      priority: 'HIGH',
      actionType: 'view_bet_invitation',
      actionData: { betId, invitationId },
      relatedBetId: betId,
      relatedUserId: fromUserId,
      relatedRequestId: invitationId,
    });
  }

  /**
   * Bet Resolved
   */
  static async notifyBetResolved(
    userId: string,
    betTitle: string,
    won: boolean,
    winnings: number,
    betId: string
  ): Promise<void> {
    await this.createNotification({
      userId: userId,
      type: 'BET_RESOLVED',
      title: won ? 'You Won!' : 'Bet Resolved',
      message: won
        ? `You won $${winnings.toFixed(2)} on "${betTitle}"!`
        : `"${betTitle}" has been resolved`,
      priority: won ? 'HIGH' : 'MEDIUM',
      actionType: 'view_bet',
      actionData: { betId },
      relatedBetId: betId,
    });
  }

  /**
   * Bet Deadline Approaching
   */
  static async notifyBetDeadlineApproaching(
    userId: string,
    betTitle: string,
    hoursRemaining: number,
    betId: string
  ): Promise<void> {
    await this.createNotification({
      userId: userId,
      type: 'BET_DEADLINE_APPROACHING',
      title: 'Bet Deadline Approaching',
      message: `"${betTitle}" closes in ${hoursRemaining} hours`,
      priority: 'MEDIUM',
      actionType: 'view_bet',
      actionData: { betId },
      relatedBetId: betId,
    });
  }

  /**
   * Bet Cancelled
   */
  static async notifyBetCancelled(
    userId: string,
    betTitle: string,
    reason: string,
    betId: string
  ): Promise<void> {
    await this.createNotification({
      userId: userId,
      type: 'BET_CANCELLED',
      title: 'Bet Cancelled',
      message: `"${betTitle}" was cancelled. ${reason}`,
      priority: 'MEDIUM',
      actionType: 'view_bet',
      actionData: { betId },
      relatedBetId: betId,
    });
  }
}

export default NotificationService;