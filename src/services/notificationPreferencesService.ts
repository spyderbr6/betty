/**
 * Notification Preferences Service
 * Centralized service for managing user notification preferences
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationType, NotificationPreferences } from '../types/betting';

const client = generateClient<Schema>();

/**
 * Mapping of notification types to preference fields
 * This allows us to check if a specific notification type is enabled
 */
const NOTIFICATION_TYPE_TO_PREFERENCE_KEY: Record<NotificationType, keyof NotificationPreferences> = {
  'FRIEND_REQUEST_RECEIVED': 'friendRequestsEnabled',
  'FRIEND_REQUEST_ACCEPTED': 'friendRequestsEnabled',
  'FRIEND_REQUEST_DECLINED': 'friendRequestsEnabled',
  'BET_INVITATION_RECEIVED': 'betInvitationsEnabled',
  'BET_INVITATION_ACCEPTED': 'betInvitationsEnabled',
  'BET_INVITATION_DECLINED': 'betInvitationsEnabled',
  'BET_JOINED': 'betJoinedEnabled',
  'BET_RESOLVED': 'betResolvedEnabled',
  'BET_CANCELLED': 'betCancelledEnabled',
  'BET_DISPUTED': 'betResolvedEnabled', // Treat disputes same as resolutions
  'BET_DEADLINE_APPROACHING': 'betDeadlineEnabled',
  'DEPOSIT_COMPLETED': 'paymentNotificationsEnabled',
  'DEPOSIT_FAILED': 'paymentNotificationsEnabled',
  'WITHDRAWAL_COMPLETED': 'paymentNotificationsEnabled',
  'WITHDRAWAL_FAILED': 'paymentNotificationsEnabled',
  'PAYMENT_METHOD_VERIFIED': 'paymentNotificationsEnabled',
  'SYSTEM_ANNOUNCEMENT': 'systemAnnouncementsEnabled',
};

export class NotificationPreferencesService {
  /**
   * Get user's notification preferences, creating defaults if they don't exist
   */
  static async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      // Fetch through the userId index. This was a filtered list, which is a paged DynamoDB
      // Scan rather than a lookup — once the table outgrew a scan page a user's own row
      // could stop being returned, and absent preferences are indistinguishable from
      // "everything disabled", silently suppressing that user's notifications.
      const { data: preferencesList } = await (client as any).models.NotificationPreferences
        .notificationPreferencesByUser({ userId });

      if (preferencesList && preferencesList.length > 0) {
        const prefs = preferencesList[0];
        return {
          id: prefs.id!,
          userId: prefs.userId!,
          pushEnabled: prefs.pushEnabled ?? true,
          inAppEnabled: prefs.inAppEnabled ?? true,
          emailEnabled: prefs.emailEnabled ?? false,
          friendRequestsEnabled: prefs.friendRequestsEnabled ?? true,
          betInvitationsEnabled: prefs.betInvitationsEnabled ?? true,
          betJoinedEnabled: prefs.betJoinedEnabled ?? true,
          betResolvedEnabled: prefs.betResolvedEnabled ?? true,
          betCancelledEnabled: prefs.betCancelledEnabled ?? true,
          betDeadlineEnabled: prefs.betDeadlineEnabled ?? true,
          paymentNotificationsEnabled: prefs.paymentNotificationsEnabled ?? true,
          systemAnnouncementsEnabled: prefs.systemAnnouncementsEnabled ?? true,
          dndEnabled: prefs.dndEnabled ?? false,
          dndStartHour: prefs.dndStartHour ?? undefined,
          dndEndHour: prefs.dndEndHour ?? undefined,
          createdAt: prefs.createdAt || new Date().toISOString(),
          updatedAt: prefs.updatedAt || new Date().toISOString(),
        };
      }

      // No preferences exist, create defaults
      console.log('[NotificationPreferences] No preferences found for user, creating defaults');
      return await this.createDefaultPreferences(userId);
    } catch (error) {
      console.error('[NotificationPreferences] Error fetching preferences:', error);
      // Return safe defaults if there's an error
      return this.getDefaultPreferences(userId);
    }
  }

  /**
   * Create default preferences for a user
   */
  static async createDefaultPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      // Cast as elsewhere in the services layer: adding the userId secondary index widened
      // the generated model type enough to trip TS2590 ("union type too complex") here.
      const { data } = await (client as any).models.NotificationPreferences.create({
        userId,
        pushEnabled: true,
        inAppEnabled: true,
        emailEnabled: false,
        friendRequestsEnabled: true,
        betInvitationsEnabled: true,
        betJoinedEnabled: true,
        betResolvedEnabled: true,
        betCancelledEnabled: true,
        betDeadlineEnabled: true,
        paymentNotificationsEnabled: true,
        systemAnnouncementsEnabled: true,
        dndEnabled: false,
      });

      if (data) {
        console.log('[NotificationPreferences] Created default preferences for user:', userId);
        return {
          id: data.id!,
          userId: data.userId!,
          pushEnabled: data.pushEnabled ?? true,
          inAppEnabled: data.inAppEnabled ?? true,
          emailEnabled: data.emailEnabled ?? false,
          friendRequestsEnabled: data.friendRequestsEnabled ?? true,
          betInvitationsEnabled: data.betInvitationsEnabled ?? true,
          betJoinedEnabled: data.betJoinedEnabled ?? true,
          betResolvedEnabled: data.betResolvedEnabled ?? true,
          betCancelledEnabled: data.betCancelledEnabled ?? true,
          betDeadlineEnabled: data.betDeadlineEnabled ?? true,
          paymentNotificationsEnabled: data.paymentNotificationsEnabled ?? true,
          systemAnnouncementsEnabled: data.systemAnnouncementsEnabled ?? true,
          dndEnabled: data.dndEnabled ?? false,
          dndStartHour: data.dndStartHour ?? undefined,
          dndEndHour: data.dndEndHour ?? undefined,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
      }

      // Fallback to in-memory defaults if creation fails
      return this.getDefaultPreferences(userId);
    } catch (error) {
      console.error('[NotificationPreferences] Error creating default preferences:', error);
      return this.getDefaultPreferences(userId);
    }
  }

  /**
   * Get default preferences (in-memory, not saved to database)
   */
  private static getDefaultPreferences(userId: string): NotificationPreferences {
    return {
      id: 'temp-id',
      userId,
      pushEnabled: true,
      inAppEnabled: true,
      emailEnabled: false,
      friendRequestsEnabled: true,
      betInvitationsEnabled: true,
      betJoinedEnabled: true,
      betResolvedEnabled: true,
      betCancelledEnabled: true,
      betDeadlineEnabled: true,
      paymentNotificationsEnabled: true,
      systemAnnouncementsEnabled: true,
      dndEnabled: false,
      dndStartHour: undefined,
      dndEndHour: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Update a single preference
   */
  static async updatePreference(
    userId: string,
    key: keyof NotificationPreferences,
    value: boolean | number
  ): Promise<boolean> {
    try {
      const preferences = await this.getUserPreferences(userId);

      if (preferences.id === 'temp-id') {
        // Preferences don't exist yet, create them first
        await this.createDefaultPreferences(userId);
        // Try again
        return await this.updatePreference(userId, key, value);
      }

      const updateData: any = { id: preferences.id };
      updateData[key] = value;

      // Cast for the same reason as the other model calls here — see createDefaultPreferences.
      await (client as any).models.NotificationPreferences.update(updateData);

      console.log(`[NotificationPreferences] Updated ${key} to ${value} for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[NotificationPreferences] Error updating preference:', error);
      return false;
    }
  }

  /**
   * Batch update multiple preferences
   */
  static async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<boolean> {
    try {
      const preferences = await this.getUserPreferences(userId);

      if (preferences.id === 'temp-id') {
        // Preferences don't exist yet, create them first
        await this.createDefaultPreferences(userId);
        // Try again
        return await this.updatePreferences(userId, updates);
      }

      const updateData: any = { id: preferences.id, ...updates };
      delete updateData.userId; // Don't update userId
      delete updateData.createdAt; // Don't update createdAt

      // Cast for the same reason as the other model calls here — see createDefaultPreferences.
      await (client as any).models.NotificationPreferences.update(updateData);

      console.log(`[NotificationPreferences] Batch updated preferences for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[NotificationPreferences] Error batch updating preferences:', error);
      return false;
    }
  }

  /**
   * Check if a specific notification type is enabled for a user
   */
  static async isNotificationEnabled(
    userId: string,
    type: NotificationType
  ): Promise<boolean> {
    try {
      const preferences = await this.getUserPreferences(userId);
      const preferenceKey = NOTIFICATION_TYPE_TO_PREFERENCE_KEY[type];

      if (!preferenceKey) {
        console.warn(`[NotificationPreferences] Unknown notification type: ${type}, allowing by default`);
        return true;
      }

      const isEnabled = preferences[preferenceKey] as boolean;
      console.log(`[NotificationPreferences] Notification type ${type} is ${isEnabled ? 'enabled' : 'disabled'} for user ${userId}`);
      return isEnabled;
    } catch (error) {
      console.error('[NotificationPreferences] Error checking notification enabled:', error);
      // Default to enabled if there's an error
      return true;
    }
  }

  /**
   * Check if currently in Do Not Disturb window
   */
  static isInDndWindow(preferences: NotificationPreferences): boolean {
    // Compare against null, not falsiness: hour 0 is midnight, a legitimate boundary that
    // `!preferences.dndStartHour` would treat as unset and silently disable DND.
    if (
      !preferences.dndEnabled ||
      preferences.dndStartHour == null ||
      preferences.dndEndHour == null
    ) {
      return false;
    }

    const currentHour = new Date().getHours();
    const start = preferences.dndStartHour;
    const end = preferences.dndEndHour;

    if (start < end) {
      // Window sits inside one day, e.g. 9 -> 17 is 9 AM to 5 PM.
      return currentHour >= start && currentHour < end;
    }

    // Window wraps midnight, e.g. 22 -> 7 is 10 PM to 7 AM. start === end is treated as
    // wrapping too, which makes it a full 24 hours rather than an empty window.
    return currentHour >= start || currentHour < end;
  }

  /**
   * Check if user should receive push notifications
   */
  static async shouldSendPush(userId: string, type: NotificationType): Promise<boolean> {
    try {
      const preferences = await this.getUserPreferences(userId);

      // Check master push switch
      if (!preferences.pushEnabled) {
        console.log(`[NotificationPreferences] Push disabled for user ${userId}`);
        return false;
      }

      // Check if in DND window
      if (this.isInDndWindow(preferences)) {
        console.log(`[NotificationPreferences] User ${userId} is in DND window`);
        return false;
      }

      // Check if this specific notification type is enabled
      return await this.isNotificationEnabled(userId, type);
    } catch (error) {
      console.error('[NotificationPreferences] Error checking should send push:', error);
      return true; // Default to sending if there's an error
    }
  }

  /**
   * Check if user should receive in-app notifications
   */
  static async shouldShowInApp(userId: string, type: NotificationType): Promise<boolean> {
    try {
      const preferences = await this.getUserPreferences(userId);

      // Check master in-app switch
      if (!preferences.inAppEnabled) {
        console.log(`[NotificationPreferences] In-app notifications disabled for user ${userId}`);
        return false;
      }

      // In-app notifications respect DND as well
      if (this.isInDndWindow(preferences)) {
        console.log(`[NotificationPreferences] User ${userId} is in DND window`);
        return false;
      }

      // Check if this specific notification type is enabled
      return await this.isNotificationEnabled(userId, type);
    } catch (error) {
      console.error('[NotificationPreferences] Error checking should show in-app:', error);
      return true; // Default to showing if there's an error
    }
  }
}

export default NotificationPreferencesService;
