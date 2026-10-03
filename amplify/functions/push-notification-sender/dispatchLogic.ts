/**
 * Pure decision logic for the notification dispatcher: turning a DynamoDB stream record
 * into a notification and deciding whether it pushes. Kept out of the handler so it can
 * be tested (see pushLogic.ts for why handlers cannot be imported by tests).
 *
 * The dispatcher is the single place push is decided, for notifications from the app and
 * from every Lambda alike. See PUSH_NOTIFICATION_GUIDE.md §1.
 */

import { NOTIFICATION_CATALOG, type NotificationType } from '../../shared/notificationCatalog';
import {
  resolvePreferences,
  shouldAlert,
  type StoredPreferences,
} from '../../shared/notificationPreferencesLogic';

/** A DynamoDB attribute value as it appears in a stream record's NewImage. */
export interface AttributeValue {
  S?: string;
  N?: string;
  BOOL?: boolean;
  NULL?: boolean;
  M?: Record<string, AttributeValue>;
  L?: AttributeValue[];
  SS?: string[];
  NS?: string[];
}

function fromAttribute(value: AttributeValue): unknown {
  if (value.S !== undefined) return value.S;
  if (value.N !== undefined) return Number(value.N);
  if (value.BOOL !== undefined) return value.BOOL;
  if (value.NULL) return null;
  if (value.M) return unmarshall(value.M);
  if (value.L) return value.L.map(fromAttribute);
  if (value.SS) return [...value.SS];
  if (value.NS) return value.NS.map(Number);
  return undefined;
}

/** DynamoDB JSON → plain object. Small enough not to need @aws-sdk/util-dynamodb. */
export function unmarshall(image: Record<string, AttributeValue> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(image ?? {})) {
    out[key] = fromAttribute(value);
  }
  return out;
}

export interface StreamNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: string;
  actionType?: string;
  actionData?: unknown;
  relatedBetId?: string;
  relatedUserId?: string;
  createdAt?: string;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * The notification in a stream record's NewImage, or null when the row is not one we can
 * push (missing fields, or a type the catalog doesn't know).
 */
export function notificationFromImage(image: Record<string, AttributeValue> | null | undefined): StreamNotification | null {
  const row = unmarshall(image);
  const { id, userId, type, title, message } = row;
  if (!isString(id) || !isString(userId) || !isString(title) || !isString(message)) return null;
  if (!isString(type) || !(type in NOTIFICATION_CATALOG)) return null;

  const optional = (key: string) => (isString(row[key]) ? (row[key] as string) : undefined);
  return {
    id,
    userId,
    type: type as NotificationType,
    title,
    message,
    priority: optional('priority'),
    actionType: optional('actionType'),
    actionData: row.actionData ?? undefined,
    relatedBetId: optional('relatedBetId'),
    relatedUserId: optional('relatedUserId'),
    createdAt: optional('createdAt'),
  };
}

/**
 * Notifications older than this are not pushed. A stream backlog after an outage would
 * otherwise deliver a burst of stale alerts ("your bet closes in 1 hour", hours later).
 * They are still in the feed.
 */
export const MAX_PUSH_AGE_MS = 60 * 60 * 1000;

export type PushDecision =
  | { push: true }
  | { push: false; reason: 'feed-only' | 'preferences' | 'stale' };

/**
 * Whether `notification` should push, given the recipient's stored preferences (or none).
 * The same rule the app applies to in-app banners, on the push channel: the type must
 * alert at all, push must be on, its category not muted, and not quiet hours in the
 * recipient's own timezone.
 */
export function decidePush(
  notification: StreamNotification,
  storedPrefs: StoredPreferences | null | undefined,
  now: Date
): PushDecision {
  const created = notification.createdAt ? Date.parse(notification.createdAt) : NaN;
  if (!Number.isNaN(created) && now.getTime() - created > MAX_PUSH_AGE_MS) {
    return { push: false, reason: 'stale' };
  }
  if (!NOTIFICATION_CATALOG[notification.type].alert) {
    return { push: false, reason: 'feed-only' };
  }
  if (!shouldAlert(notification.type, resolvePreferences(storedPrefs), 'push', now)) {
    return { push: false, reason: 'preferences' };
  }
  return { push: true };
}

/** Delivery priority: HIGH and URGENT notifications go out urgently, everything else normally. */
export function pushPriority(priority: string | undefined): 'HIGH' | 'MEDIUM' {
  return priority === 'HIGH' || priority === 'URGENT' ? 'HIGH' : 'MEDIUM';
}

/**
 * The data a push carries, which the app uses to navigate when it is tapped
 * (pushNotificationConfig.handleNotificationResponse, and the web service worker).
 * actionData is written as JSON text by the app but may arrive as a map; either way it
 * is passed on as an object.
 */
export function pushData(notification: StreamNotification): Record<string, unknown> {
  let actionData = notification.actionData;
  if (typeof actionData === 'string') {
    try {
      actionData = JSON.parse(actionData);
    } catch {
      // Leave as text.
    }
  }
  return {
    notificationId: notification.id,
    type: notification.type,
    actionType: notification.actionType,
    actionData,
    relatedBetId: notification.relatedBetId,
    relatedUserId: notification.relatedUserId,
  };
}

/** Expo accepts at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;

export function chunk<T>(items: readonly T[], size: number = EXPO_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Web Push delivery options. TTL bounds how long the browser's push service holds a
 * message for an offline browser; urgency lets it wake a sleeping device for what matters.
 */
export function webPushOptions(priority: 'HIGH' | 'MEDIUM'): { TTL: number; urgency: 'high' | 'normal' } {
  return {
    TTL: 24 * 60 * 60,
    urgency: priority === 'HIGH' ? 'high' : 'normal',
  };
}
