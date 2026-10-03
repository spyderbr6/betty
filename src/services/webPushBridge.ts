/**
 * The app's side of the web service worker (public/service-worker.js). Web only.
 *
 * - A clicked notification reaches the app in one of two ways: as a message to a tab
 *   that is already open, or as a `?notification=` parameter on a tab the worker opened.
 *   Both are routed like a native push tap (notificationTap.ts).
 * - When the browser replaces a push subscription, the worker re-subscribes and tells
 *   any open tab, which registers the new subscription for this device.
 *
 * See PUSH_NOTIFICATION_GUIDE.md §1.
 */

import { Platform } from 'react-native';
import {
  SW_NOTIFICATION_CLICK,
  SW_SUBSCRIPTION_CHANGED,
  notificationTapRouter,
  pushDataFromUrl,
  tapFromPushData,
  withoutNotificationParam,
} from './notificationTap';
import { NotificationService } from './notificationService';

let started = false;

export function startWebPushBridge(): void {
  if (Platform.OS !== 'web' || started || typeof window === 'undefined') return;
  started = true;

  // A tab the service worker opened for a click. Drop the parameter from the address
  // bar straight away so a reload or a shared link doesn't replay it.
  const launched = pushDataFromUrl(window.location.href);
  if (launched !== null) {
    window.history.replaceState(window.history.state, '', withoutNotificationParam(window.location.href));
    const tap = tapFromPushData(launched);
    if (tap) notificationTapRouter.open(tap);
  }

  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as { type?: string; data?: unknown } | null;
    if (message?.type === SW_NOTIFICATION_CLICK) {
      const tap = tapFromPushData(message.data);
      if (tap) notificationTapRouter.open(tap);
    } else if (message?.type === SW_SUBSCRIPTION_CHANGED) {
      NotificationService.refreshDeviceRegistration().catch((error) => {
        console.warn('[Web Push] Could not register the renewed subscription:', error);
      });
    }
  });
}
