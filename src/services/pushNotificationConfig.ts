/**
 * Push Notification Configuration
 * Configure Expo notifications for the app
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  ANDROID_DEFAULT_CHANNEL,
  CATEGORY_INFO,
  NOTIFICATION_CATEGORIES,
  androidChannelId,
} from '../../amplify/shared/notificationCatalog';
import { notificationTapRouter, tapFromPushData, type TapHandler } from './notificationTap';

// How a push is presented while the app is in the foreground. No system banner or sound:
// the same notification also arrives through NotificationContext's subscription, which
// shows the in-app toast, so showing both displayed every foreground notification twice.
// It still goes into the notification list so it isn't lost if the toast is missed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Set the handler that navigates when a push is tapped (AppNavigator, once its navigator
 * is ready). Taps that arrive before it is set are held and delivered when it is.
 * Pass null when the navigator goes away.
 */
export const setPushNavigationCallback = (callback: TapHandler | null) => {
  notificationTapRouter.setHandler(callback);
};

/**
 * Create the Android notification channels: one per category, so Android's own
 * notification settings for the app list the same categories as ours, plus the
 * fallback channel. Must run before the permission request: Android 13+ only offers
 * the permission dialog once the app has a channel.
 */
async function createAndroidChannels() {
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL, {
    name: 'General',
    description: 'Notifications without a category, such as test notifications',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });

  for (const category of NOTIFICATION_CATEGORIES) {
    const info = CATEGORY_INFO[category];
    await Notifications.setNotificationChannelAsync(androidChannelId(category), {
      name: info.label,
      description: info.description,
      importance:
        info.androidImportance === 'high'
          ? Notifications.AndroidImportance.HIGH
          : Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  // Replaced by the category channels. Deleting it removes it from the app's system
  // settings; anything already shown in it stays.
  await Notifications.deleteNotificationChannelAsync('urgent');
}

/**
 * Initialize push notification configuration
 */
export const initializePushNotifications = async () => {
  if (Platform.OS === 'android') {
    await createAndroidChannels();
  }

  if (Platform.OS !== 'web') {
    // A tap that launched the app from scratch. The response listener may also report
    // it; handleNotificationResponse ignores the repeat. Cleared once handled so a JS
    // reload does not route it again.
    const launchResponse = Notifications.getLastNotificationResponse();
    if (launchResponse) {
      handleNotificationResponse(launchResponse);
      Notifications.clearLastNotificationResponse();
    }
  }
};

// The last response handled, so the launch tap is not routed twice.
let lastHandledResponseId: string | null = null;

/**
 * Handle a tapped native push: route it to the screen it is about, through the tap
 * router so a tap that launched the app waits for sign-in to finish.
 */
export const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
  const id = response.notification.request.identifier;
  if (id && id === lastHandledResponseId) return;
  lastHandledResponseId = id;

  const tap = tapFromPushData(response.notification.request.content.data);
  if (tap) {
    notificationTapRouter.open(tap);
  }
};

/**
 * Add notification response listener
 */
export const addNotificationResponseListener = () => {
  return Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
};

/**
 * Remove notification response listener
 */
export const removeNotificationResponseListener = (subscription: Notifications.Subscription) => {
  subscription.remove();
};

/**
 * Show `count` on the app icon (iOS; Android launchers count notifications themselves).
 * The dispatcher sets it when a push arrives; the app corrects it as notifications are read.
 */
export const setAppBadgeCount = async (count: number) => {
  if (Platform.OS !== 'ios') return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch (error) {
    console.warn('[Push] Could not set the app badge:', error);
  }
};
