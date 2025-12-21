/**
 * Service Worker for SideBet Web Push Notifications
 *
 * Handles push notification events and displays them to users
 * when they're not actively using the app.
 */

// Version for cache busting
const CACHE_VERSION = 'v1';
const CACHE_NAME = `sidebet-${CACHE_VERSION}`;

// Install event - called when service worker is first installed
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing service worker...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - called when service worker is activated
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating service worker...');
  // Claim all clients immediately
  event.waitUntil(self.clients.claim());
});

// Push event - called when a push notification is received
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');

  let notificationData = {
    title: 'SideBet Notification',
    body: 'You have a new notification',
    icon: '/assets/icon.png',
    badge: '/assets/icon.png',
    tag: 'default',
    data: {}
  };

  // Parse the push notification data
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('[Service Worker] Push payload:', payload);

      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.message || payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        tag: payload.tag || payload.type || notificationData.tag,
        data: payload.data || payload,
        // Additional options
        requireInteraction: payload.priority === 'URGENT',
        vibrate: [200, 100, 200],
      };
    } catch (error) {
      console.error('[Service Worker] Error parsing push data:', error);
    }
  }

  // Show the notification
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData.data,
      requireInteraction: notificationData.requireInteraction,
      vibrate: notificationData.vibrate,
    })
  );
});

// Notification click event - called when user clicks on a notification
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.notification);
  event.notification.close();

  const notificationData = event.notification.data || {};
  const urlToOpen = getUrlFromNotificationData(notificationData);

  console.log('[Service Worker] Opening URL:', urlToOpen);

  // Open the app or focus existing window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Navigate to the URL and focus the window
          return client.focus().then(() => {
            if ('navigate' in client) {
              return client.navigate(urlToOpen);
            }
          });
        }
      }

      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

/**
 * Generate URL to navigate to based on notification data
 * Implements deep linking logic for different notification types
 */
function getUrlFromNotificationData(data) {
  const baseUrl = self.location.origin;

  // Handle different notification types
  if (data.actionType) {
    switch (data.actionType) {
      case 'view_bet':
      case 'view_bet_invitation':
        if (data.betId || data.actionData?.betId) {
          const betId = data.betId || data.actionData?.betId;
          return `${baseUrl}/?bet=${betId}`;
        }
        break;

      case 'view_friend_requests':
        return `${baseUrl}/?screen=account&tab=friends`;

      case 'view_friends':
        return `${baseUrl}/?screen=account&tab=friends`;

      case 'view_notifications':
        return `${baseUrl}/?screen=account&tab=notifications`;

      case 'view_transaction':
        return `${baseUrl}/?screen=account&tab=transactions`;

      default:
        break;
    }
  }

  // Handle notification types
  if (data.type) {
    switch (data.type) {
      case 'BET_RESOLVED':
      case 'BET_DEADLINE_APPROACHING':
      case 'BET_CANCELLED':
        if (data.relatedBetId) {
          return `${baseUrl}/?bet=${data.relatedBetId}`;
        }
        break;

      case 'BET_INVITATION_RECEIVED':
        return `${baseUrl}/?screen=account`;

      case 'FRIEND_REQUEST_RECEIVED':
      case 'FRIEND_REQUEST_ACCEPTED':
        return `${baseUrl}/?screen=account&tab=friends`;

      case 'DEPOSIT_COMPLETED':
      case 'DEPOSIT_FAILED':
      case 'WITHDRAWAL_COMPLETED':
      case 'WITHDRAWAL_FAILED':
        return `${baseUrl}/?screen=account&tab=transactions`;

      case 'SYSTEM_ANNOUNCEMENT':
        return `${baseUrl}/?screen=account&tab=notifications`;

      default:
        break;
    }
  }

  // Default: open to home screen
  return baseUrl;
}

// Background sync event (for future use)
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
});

// Message event - for communication with the main app
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
