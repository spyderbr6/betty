/**
 * Routing a tapped push to the right screen, on every platform.
 *
 * A tap can arrive before there is anywhere to send it: the app was launched by the tap
 * (native cold start, or a new browser tab opened by the service worker) and the user is
 * still signing in, so the navigator does not exist yet. Taps that arrive early are held
 * and delivered once the navigator registers. Previously they were dropped with a warning.
 *
 * Plain logic, no React Native imports, so it can be unit tested.
 * See PUSH_NOTIFICATION_GUIDE.md §1.
 */

import type { NotificationType } from '../types/betting';

export interface NotificationTap {
  type: NotificationType;
  data: {
    notificationId?: string;
    actionType?: string;
    actionData?: unknown;
    relatedBetId?: string;
    relatedUserId?: string;
  };
}

export type TapHandler = (type: NotificationType, data: NotificationTap['data']) => void;

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/**
 * The tap described by a push's data payload (dispatchLogic.pushData), or null when it
 * carries no notification type to route on, as with the Settings test push.
 */
export function tapFromPushData(raw: unknown): NotificationTap | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const type = text(d.type);
  if (!type || d.test === true) return null;
  return {
    type: type as NotificationType,
    data: {
      notificationId: text(d.notificationId),
      actionType: text(d.actionType),
      actionData: d.actionData,
      relatedBetId: text(d.relatedBetId),
      relatedUserId: text(d.relatedUserId),
    },
  };
}

/** The query parameter the service worker opens a new tab with (public/service-worker.js). */
export const NOTIFICATION_PARAM = 'notification';

/** Messages the service worker posts to open tabs (public/service-worker.js). */
export const SW_NOTIFICATION_CLICK = 'sidebet:notification-click';
export const SW_SUBSCRIPTION_CHANGED = 'sidebet:subscription-changed';

/** The push data in a URL's `?notification=` parameter, or null if absent or unreadable. */
export function pushDataFromUrl(href: string): unknown {
  try {
    const value = new URL(href).searchParams.get(NOTIFICATION_PARAM);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

/** `href` without the `?notification=` parameter, so a reload does not replay the tap. */
export function withoutNotificationParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(NOTIFICATION_PARAM);
  return url.pathname + url.search + url.hash;
}

/**
 * Holds taps until a handler is registered. Only the latest early tap is kept: if the
 * user tapped twice before the app was ready, they want the second.
 */
export function createTapRouter() {
  let handler: TapHandler | null = null;
  let pending: NotificationTap | null = null;

  return {
    setHandler(next: TapHandler | null) {
      handler = next;
      if (handler && pending) {
        const tap = pending;
        pending = null;
        handler(tap.type, tap.data);
      }
    },
    open(tap: NotificationTap) {
      if (handler) {
        handler(tap.type, tap.data);
      } else {
        pending = tap;
      }
    },
    hasPending: () => pending !== null,
  };
}

/** The app's one router: native taps and web clicks both go through it. */
export const notificationTapRouter = createTapRouter();
