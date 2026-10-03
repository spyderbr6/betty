/**
 * Notification Service
 * Centralized service for creating and managing notifications
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { NotificationType, NotificationPriority, Notification } from '../types/betting';
import * as Notifications from 'expo-notifications';
// Temporarily remove Device import to avoid native module issues
// import * as Device from 'expo-device';
// Removed Constants import to avoid dependency issues
// import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { NotificationPreferencesService } from './notificationPreferencesService';
import { subscribeToWebPush, isWebPushSupported } from '../utils/webPushUtils';
import { getInstallationId } from './installationId';
import { describeUserAgent } from './deviceDescription';
import { notificationMeta } from '../../amplify/shared/notificationCatalog';
import { isFeedVisible } from '../../amplify/shared/notificationPreferencesLogic';

const client = generateClient<Schema>();

export type DevicePushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Name shown in Settings' device list, e.g. "Chrome on Windows" or "Google Pixel 8". */
function describeThisDevice(): string {
  if (Platform.OS === 'web') {
    return describeUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  }
  if (Platform.OS === 'ios') {
    return Platform.isPad ? 'iPad' : 'iPhone';
  }
  const { Brand, Model } = (Platform.constants ?? {}) as { Brand?: string; Model?: string };
  const brand = Brand ? Brand.charAt(0).toUpperCase() + Brand.slice(1) : '';
  return [brand, Model].filter(Boolean).join(' ') || 'Android device';
}

/** The device's IANA timezone, used later to apply quiet hours in the user's local time. */
function currentTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Who this device registered for in this session, so resume/refresh doesn't re-register. */
let sessionRegistration: { userId: string; token: string } | null = null;

export class NotificationService {
  /**
   * Register this device's push token for the user (Expo on mobile, Web Push on web).
   *
   * Registration is an upsert keyed on this installation (see saveDeviceToken), so it is
   * safe to call on every launch and auth refresh. Runs at most once per session per user
   * unless `force` is set.
   *
   * `prompt` controls whether the OS/browser permission dialog may be shown. It defaults
   * to false on web: browsers only honour the prompt from a user gesture (Safari rejects
   * it outright, Chrome penalises the site), so web prompts come from a tap in Settings.
   */
  static async registerPushToken(
    userId: string,
    options: { prompt?: boolean; force?: boolean } = {}
  ): Promise<string | null> {
    const prompt = options.prompt ?? Platform.OS !== 'web';

    if (!options.force && sessionRegistration?.userId === userId) {
      return sessionRegistration.token;
    }

    try {
      const token = await this.getDevicePushToken(prompt);
      if (!token) return null;

      await this.saveDeviceToken(token);
      sessionRegistration = { userId, token };
      console.log('[Push] Device token registered for user', userId);
      return token;
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'E_REGISTRATION_FAILED') {
        // FCM credentials are configured (google-services.json + FCM V1 key on EAS), so
        // this almost always means the device has no Google Play services — e.g. an AOSP
        // emulator image — or the installed build predates the credentials.
        console.warn('[Push] Native push registration failed (E_REGISTRATION_FAILED). Check the device has Google Play services and the build includes FCM credentials. In-app notifications still work.');
      } else {
        console.error('[Push] Error registering push token:', error);
      }
      return null;
    }
  }

  /**
   * Register this device again for whoever it is registered for this session, after its
   * token changed underneath us (the browser renewed the web push subscription). Does
   * nothing when nobody is signed in: the next sign-in registers the current token anyway.
   */
  static async refreshDeviceRegistration(): Promise<void> {
    if (!sessionRegistration) return;
    await this.registerPushToken(sessionRegistration.userId, { force: true });
  }

  /**
   * This device's push token, or null when push is unsupported or permission is not granted.
   * Only shows a permission dialog when `prompt` is true.
   */
  static async getDevicePushToken(prompt: boolean): Promise<string | null> {
    if (Platform.OS === 'web') {
      if (!isWebPushSupported()) {
        console.log('[Push] Web push not supported in this browser');
        return null;
      }
      if (window.Notification.permission !== 'granted' && !prompt) {
        return null;
      }
      // Requests permission when not yet granted, then reuses or creates the subscription.
      return await subscribeToWebPush();
    }

    if (!Notifications.getExpoPushTokenAsync) {
      console.log('[Push] Notifications not supported in this environment');
      return null;
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && prompt) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') {
      console.log('[Push] Notification permission not granted');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'f26fa72b-c85a-4174-90bb-1b14c526ed05', // EAS project ID from app.json
    });
    return token.data;
  }

  /**
   * Permission state for push on this device, for the Settings screen.
   */
  static async getDevicePushPermission(): Promise<DevicePushPermission> {
    try {
      if (Platform.OS === 'web') {
        if (!isWebPushSupported()) return 'unsupported';
        if (window.Notification.permission === 'granted') return 'granted';
        if (window.Notification.permission === 'denied') return 'denied';
        return 'undetermined';
      }
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'denied' && !canAskAgain) return 'denied';
      return 'undetermined';
    } catch {
      return 'unsupported';
    }
  }

  /**
   * Record this device's token for the user, through the registerDevice mutation. The
   * device-registry Lambda upserts the PushDevice row for this installation and takes the
   * token over from any other user on a shared device.
   */
  private static async saveDeviceToken(token: string): Promise<void> {
    const { errors } = await client.mutations.registerDevice({
      installationId: await getInstallationId(),
      token,
      platform: Platform.OS.toUpperCase() as 'IOS' | 'ANDROID' | 'WEB',
      deviceName: describeThisDevice(),
      timezone: currentTimezone(),
    });
    if (errors?.length) {
      throw new Error(`registerDevice failed: ${errors.map((e) => e.message).join('; ')}`);
    }
  }

  /**
   * Stop pushing to this device. Called before sign-out so a shared device stops receiving
   * the previous user's pushes. The user's other devices are left alone, and so is this
   * device's on/off switch, which is restored on the next sign-in.
   */
  static async unregisterThisDevice(): Promise<void> {
    try {
      const { errors } = await client.mutations.unregisterDevice({ installationId: await getInstallationId() });
      if (errors?.length) {
        console.error('[Push] unregisterDevice failed:', errors);
      }
    } catch (error) {
      console.error('[Push] Error unregistering this device:', error);
    } finally {
      sessionRegistration = null;
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
  }): Promise<Notification | null> {
    try {
      console.log('[Notification] Creating notification:', { userId, type, title, message, priority });

      // Every notification is written: the feed is the record, and whether it *shows* there
      // is decided when the feed is read (isFeedVisible). Whether it pushes is decided by the
      // dispatcher on the Notification table's stream, for app- and Lambda-raised
      // notifications alike — nothing here needs the recipient's preferences.
      console.log('[Notification] Full params:', {
        userId, type, title, message, priority, actionType, actionData,
        relatedBetId, relatedUserId, relatedRequestId
      });

      const result = await client.models.Notification.create({
        userId,
        type,
        ...notificationMeta(type),
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

        // No toast here. NotificationContext's onCreate subscription is the single place
        // in-app banners come from; showing one here as well toasted every notification a
        // user raised for themselves twice.

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
          limit: requestedLimit * 2, // Fetch extra to account for feed filtering below
          sortDirection: 'DESC' // Newest first
        });
        data = response.data || [];
        console.log(`[Notification] GSI query returned ${data.length} notifications`);
      }

      // Hide categories the user has taken out of their feed. Feed-locked categories (money,
      // results, refunds, disputes) always show. Applied at read time, so changing the
      // preference applies to notifications already received, and the unread count — which
      // comes through here too — only counts what the feed shows.
      const preferences = await NotificationPreferencesService.getUserPreferences(userId);
      data = data.filter((n: any) => isFeedVisible(n, preferences));

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