/**
 * SideBet service worker: shows web push notifications and routes clicks into the app.
 *
 * Payloads come from the dispatcher (amplify/functions/push-notification-sender,
 * dispatchLogic.webPushPayload). Clicks are handed to the app, which routes them like a
 * native push tap (src/services/webPushBridge.ts). See PUSH_NOTIFICATION_GUIDE.md §1.
 *
 * Plain JS, copied to the site root by `expo export` and not bundled: keep it
 * dependency-free.
 */

// Keep in step with src/services/webPushBridge.ts.
const NOTIFICATION_CLICK = 'sidebet:notification-click';
const SUBSCRIPTION_CHANGED = 'sidebet:subscription-changed';
const NOTIFICATION_PARAM = 'notification';

// Kept in step with the VAPID public key in src/utils/webPushUtils.ts, for renewing a
// subscription when the browser does not hand over the old one's options.
const VAPID_PUBLIC_KEY = 'BHREIE9gIc8ok6jMDRv0eGw_SUmAN77dav_Z5AJ1H8dM2oPBpk4YEvnIVP76-z2gqvZvkBsO9bxx_5Sk1BYlK9I';

const DEFAULT_ICON = '/icons/icon-192.png';
const DEFAULT_BADGE = '/icons/badge-96.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Safari ends a site's push subscription if a push arrives and no notification is shown,
 * so on Safari every push is shown even while the app is open and focused.
 */
function isSafari() {
  const ua = self.navigator.userAgent;
  return /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Android)\//.test(ua);
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('[Service Worker] Unreadable push payload:', error);
  }
  const data = payload.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      // Someone looking at the app already gets the in-app banner for this notification
      // (NotificationContext), so a system notification on top would show it twice. The
      // test push from Settings is always shown: that is the point of it.
      const focused = tabs.some((tab) => tab.focused);
      if (focused && !data.test && !isSafari()) return undefined;

      return self.registration.showNotification(payload.title || 'SideBet', {
        body: payload.body || payload.message || '',
        icon: payload.icon || DEFAULT_ICON,
        badge: payload.badge || DEFAULT_BADGE,
        tag: payload.tag || 'sidebet',
        data,
        requireInteraction: payload.priority === 'URGENT',
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
      if (tab) {
        // An open tab routes the click itself, keeping whatever state it has.
        tab.postMessage({ type: NOTIFICATION_CLICK, data });
        return 'focus' in tab ? tab.focus() : undefined;
      }
      // No tab: open one, carrying the click. The app reads the parameter on load and
      // routes it once the user is signed in.
      const url = new URL('/', self.location.origin);
      url.searchParams.set(NOTIFICATION_PARAM, JSON.stringify(data));
      return self.clients.openWindow ? self.clients.openWindow(url.href) : undefined;
    })
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * The browser replaced or expired the push subscription. Subscribe again and tell any
 * open tab, which registers the new one for this device. With no tab open, the next
 * launch registers it: the app registers the current subscription on every sign-in.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = (event.oldSubscription && event.oldSubscription.options) || {
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  };
  event.waitUntil(
    self.registration.pushManager
      .subscribe(options)
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((tabs) => tabs.forEach((tab) => tab.postMessage({ type: SUBSCRIPTION_CHANGED })))
      .catch((error) => console.error('[Service Worker] Could not renew the push subscription:', error))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
