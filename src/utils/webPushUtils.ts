/**
 * Web Push Notification Utilities
 *
 * Handles web push notification subscriptions using the Web Push API
 * and VAPID keys for browser-based push notifications.
 */

// VAPID Public Key - Safe to expose to clients
export const VAPID_PUBLIC_KEY = 'BHREIE9gIc8ok6jMDRv0eGw_SUmAN77dav_Z5AJ1H8dM2oPBpk4YEvnIVP76-z2gqvZvkBsO9bxx_5Sk1BYlK9I';

/**
 * Convert VAPID key from base64 string to Uint8Array
 * Required format for PushManager.subscribe()
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if web push notifications are supported in this browser
 */
export function isWebPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Request notification permission from the user
 * Returns the permission state: 'granted', 'denied', or 'default'
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Notifications not supported in this browser');
  }

  return await Notification.requestPermission();
}

/**
 * Register service worker for web push notifications
 * Returns the service worker registration
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers not supported in this browser');
  }

  try {
    // Register the service worker
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('[Web Push] Service worker registered:', registration.scope);

    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    console.log('[Web Push] Service worker ready');

    return registration;
  } catch (error) {
    console.error('[Web Push] Service worker registration failed:', error);
    throw error;
  }
}

/**
 * Subscribe user to web push notifications
 * Returns the push subscription object as a JSON string
 *
 * NOTE: Service worker must already be registered (handled in App.tsx on startup)
 */
export async function subscribeToWebPush(): Promise<string> {
  if (!isWebPushSupported()) {
    throw new Error('Web push notifications not supported');
  }

  try {
    // Request permission
    console.log('[Web Push] Requesting notification permission...');
    const permission = await requestNotificationPermission();
    console.log('[Web Push] Permission result:', permission);

    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    // Wait for service worker to be ready (already registered in App.tsx)
    console.log('[Web Push] Waiting for service worker to be ready...');
    const registration = await navigator.serviceWorker.ready;
    console.log('[Web Push] Service worker ready, scope:', registration.scope);

    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create new subscription with VAPID public key
      console.log('[Web Push] Creating new push subscription...');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      console.log('[Web Push] ✅ New subscription created');
    } else {
      console.log('[Web Push] ✅ Using existing subscription');
    }

    // Convert subscription to JSON string for storage
    return JSON.stringify(subscription.toJSON());
  } catch (error) {
    console.error('[Web Push] ❌ Subscription failed:', error);
    throw error;
  }
}

/**
 * Unsubscribe from web push notifications
 */
export async function unsubscribeFromWebPush(): Promise<void> {
  if (!isWebPushSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      console.log('[Web Push] Unsubscribed from push notifications');
    }
  } catch (error) {
    console.error('[Web Push] Unsubscribe failed:', error);
    throw error;
  }
}

/**
 * Get current push subscription status
 */
export async function getWebPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('[Web Push] Failed to get subscription:', error);
    return null;
  }
}

/**
 * Check if user has granted notification permission
 */
export function hasNotificationPermission(): boolean {
  if (!('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}
