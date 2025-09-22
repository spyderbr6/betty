/**
 * Notification Service
 * Centralized service for creating and managing notifications
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationType, NotificationPriority, Notification } from '../types/betting';
import * as Notifications from 'expo-notifications';
// Temporarily remove Device import to avoid native module issues
// import * as Device from 'expo-device';
// Removed Constants import to avoid dependency issues
// import Constants from 'expo-constants';
import { Platform } from 'react-native';

const client = generateClient<Schema>();

export class NotificationService {
  /**
   * Register push token for user
   */
  static async registerPushToken(userId: string): Promise<string | null> {
    try {
      // Skip device check for now - will work on simulators for testing
      // if (!Device.isDevice) {
      //   console.log('Push notifications only work on physical devices');
      //   return null;
      // }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync();

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

      console.log('Push token registered:', token.data);
      return token.data;
    } catch (error) {
      console.error('Error registering push token:', error);
      return null;
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
      const { data } = await client.models.Notification.create({
        userId,
        type,
        title,
        message,
        isRead: false,
        priority,
        actionType,
        actionData,
        relatedBetId,
        relatedUserId,
        relatedRequestId,
      });

      if (data) {
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

        // Send push notification for high priority notifications
        if (sendPush && (priority === 'HIGH' || priority === 'URGENT')) {
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
        }

        return notification;
      }
      return null;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  }

  /**
   * Get notifications for a user
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
      const filter: any = { userId: { eq: userId } };

      if (options.unreadOnly) {
        filter.isRead = { eq: false };
      }

      if (options.type) {
        filter.type = { eq: options.type };
      }

      const { data } = await client.models.Notification.list({
        filter,
        limit: options.limit || 50,
      });

      return (data || []).map(notification => ({
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
      }));
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
      return notifications.length;
    } catch (error) {
      console.error('Error getting unread count:', error);
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