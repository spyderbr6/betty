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
import { describeUserAgent, planTokenUpsert, rowsForDeviceSignOut, PushTokenRow } from './pushRegistrationLogic';
import { notificationMeta } from '../../amplify/shared/notificationCatalog';

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
   * Upserts by token value, so calling this on every launch, resume and auth refresh
   * no longer adds a row each time (see pushRegistrationLogic). Runs at most once per
   * session per user unless `force` is set.
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

      await this.saveDeviceToken(userId, token);
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
   * Record this device's token for the user.
   *
   * Goes through the registerDevice mutation, which upserts the PushDevice row for this
   * installation server-side and takes the token over from any other user on a shared
   * device. Legacy PushToken rows for this device are then retired so the old table winds
   * down. If the bundled amplify_outputs.json predates registerDevice, falls back to the
   * legacy PushToken upsert so push keeps working until the config is refreshed.
   */
  private static async saveDeviceToken(userId: string, token: string): Promise<void> {
    const installationId = await getInstallationId();

    if (typeof client.mutations.registerDevice !== 'function') {
      console.warn('[Push] registerDevice is missing from the Amplify config; using legacy PushToken registration');
      await this.upsertLegacyToken(userId, token, installationId);
      return;
    }

    const { errors } = await client.mutations.registerDevice({
      installationId,
      token,
      platform: Platform.OS.toUpperCase() as 'IOS' | 'ANDROID' | 'WEB',
      deviceName: describeThisDevice(),
      timezone: currentTimezone(),
    });
    if (errors?.length) {
      throw new Error(`registerDevice failed: ${errors.map((e) => e.message).join('; ')}`);
    }

    await this.retireLegacyRows(userId, { token, installationId });
  }

  /** Phase 0 registration into PushToken: one row per token, duplicates deactivated. */
  private static async upsertLegacyToken(userId: string, token: string, installationId: string): Promise<void> {
    const rows = await this.listUserTokenRows(userId);
    const plan = planTokenUpsert(rows, token, new Date());
    const now = new Date().toISOString();

    if (plan.create) {
      await client.models.PushToken.create({
        userId,
        token,
        platform: Platform.OS.toUpperCase() as 'IOS' | 'ANDROID' | 'WEB',
        deviceId: installationId,
        appVersion: '1.0.0',
        isActive: true,
        lastUsed: now,
      });
    } else if (plan.keepId && plan.touchKept) {
      await client.models.PushToken.update({
        id: plan.keepId,
        isActive: true,
        lastUsed: now,
        deviceId: installationId,
      });
    }

    if (plan.deactivateIds.length > 0) {
      console.log(`[Push] Deactivating ${plan.deactivateIds.length} duplicate token rows`);
      await Promise.all(
        plan.deactivateIds.map((id) => client.models.PushToken.update({ id, isActive: false }))
      );
    }
  }

  /** Deactivate this device's rows in the legacy PushToken table. */
  private static async retireLegacyRows(
    userId: string,
    device: { token?: string | null; installationId: string }
  ): Promise<void> {
    const rows = await this.listUserTokenRows(userId);
    const ids = rowsForDeviceSignOut(rows, device);
    await Promise.all(ids.map((id) => client.models.PushToken.update({ id, isActive: false })));
    if (ids.length > 0) {
      console.log(`[Push] Retired ${ids.length} legacy token rows for this device`);
    }
  }

  /**
   * Stop pushing to this device for the user. Called before sign-out so a shared device
   * stops receiving the previous user's pushes. The user's other devices are left alone,
   * and so is this device's on/off switch, which is restored on the next sign-in.
   */
  static async unregisterThisDevice(userId: string): Promise<void> {
    try {
      const installationId = await getInstallationId();
      if (typeof client.mutations.unregisterDevice === 'function') {
        const { errors } = await client.mutations.unregisterDevice({ installationId });
        if (errors?.length) {
          console.error('[Push] unregisterDevice failed:', errors);
        }
      }

      const token = sessionRegistration?.token ?? (await this.getDevicePushToken(false).catch(() => null));
      await this.retireLegacyRows(userId, { token, installationId });
    } catch (error) {
      console.error('[Push] Error unregistering this device:', error);
    } finally {
      sessionRegistration = null;
    }
  }

  /**
   * All of the user's token rows, through the userId index. Pages through results: before
   * registration was an upsert, one device could hold dozens of duplicate rows.
   */
  private static async listUserTokenRows(userId: string): Promise<PushTokenRow[]> {
    const rows: PushTokenRow[] = [];
    let nextToken: string | null | undefined;
    do {
      // Cast as elsewhere in this layer: the index query trips TS2590 on the generated types.
      const response: { data?: PushTokenRow[] | null; nextToken?: string | null } =
        await (client.models.PushToken as any).pushTokensByUser({ userId }, { limit: 200, nextToken });
      rows.push(...(response.data ?? []));
      nextToken = response.nextToken;
    } while (nextToken);
    return rows;
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