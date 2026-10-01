/**
 * Notification Preferences Service
 *
 * Loads and saves a user's notification preferences. What they *mean* — whether a
 * notification may alert, whether it shows in the feed, quiet hours — lives in
 * amplify/shared/notificationPreferencesLogic.ts, shared with the server, so the app and
 * the dispatcher decide the same way. See docs/NOTIFICATIONS_PLAN.md §3.3.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import {
  resolvePreferences,
  toStoredPreferences,
  type ResolvedPreferences,
  type StoredPreferences,
} from '../../amplify/shared/notificationPreferencesLogic';

const client = generateClient<Schema>();

/** Resolved preferences plus the row they came from (null when there is no row yet). */
export interface UserNotificationPreferences extends ResolvedPreferences {
  id: string | null;
  userId: string;
}

// Cast as elsewhere in the services layer: the userId index widened the generated model
// type enough to trip TS2590 ("union type too complex").
const prefsModel = () => (client as any).models.NotificationPreferences;

export class NotificationPreferencesService {
  /**
   * The user's preferences, creating the row with defaults if it doesn't exist.
   * On any failure, returns defaults (nothing muted) rather than throwing: a lookup
   * problem must never silently suppress a user's notifications.
   */
  static async getUserPreferences(userId: string): Promise<UserNotificationPreferences> {
    try {
      // Through the userId index. A filtered list is a paged DynamoDB Scan, and once the
      // table outgrew a scan page a user's own row could stop being returned.
      const { data } = await prefsModel().notificationPreferencesByUser({ userId });
      const row = (data ?? [])[0] as (StoredPreferences & { id: string }) | undefined;
      if (row) {
        return { ...resolvePreferences(row), id: row.id, userId };
      }
      return await this.createDefaultPreferences(userId);
    } catch (error) {
      console.error('[NotificationPreferences] Error fetching preferences:', error);
      return { ...resolvePreferences(null), id: null, userId };
    }
  }

  /**
   * Create the preferences row with defaults. New rows start in the category format
   * (empty mute lists), so the legacy switches are never consulted for them.
   */
  static async createDefaultPreferences(userId: string): Promise<UserNotificationPreferences> {
    const defaults = resolvePreferences(null);
    try {
      const { data } = await prefsModel().create({
        userId,
        ...toStoredPreferences(defaults),
      });
      if (data) {
        console.log('[NotificationPreferences] Created default preferences for user:', userId);
        return { ...resolvePreferences(data), id: data.id, userId };
      }
    } catch (error) {
      console.error('[NotificationPreferences] Error creating default preferences:', error);
    }
    return { ...defaults, id: null, userId };
  }

  /**
   * Save `prefs` in full. Writing both mute lists moves a legacy row to the new format,
   * so the old per-type switches stop being consulted from here on.
   */
  static async savePreferences(userId: string, prefs: ResolvedPreferences): Promise<boolean> {
    try {
      let { id } = await this.getUserPreferences(userId);
      if (!id) {
        ({ id } = await this.createDefaultPreferences(userId));
      }
      if (!id) return false;

      const { errors } = await prefsModel().update({ id, ...toStoredPreferences(prefs) });
      if (errors?.length) {
        console.error('[NotificationPreferences] Save failed:', errors);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[NotificationPreferences] Error saving preferences:', error);
      return false;
    }
  }
}

export default NotificationPreferencesService;
