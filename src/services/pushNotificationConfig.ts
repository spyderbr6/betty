/**
 * Push Notification Configuration
 * Configure Expo notifications for the app
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationType } from '../types/betting';

// Configure how notifications are handled when the app is running
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Navigation callback type
type NavigationCallback = (type: NotificationType, data?: any) => void;

// Global navigation callback
let navigationCallback: NavigationCallback | null = null;

/**
 * Set navigation callback for handling push notification taps
 * This should be called from AppNavigator when navigation is ready
 */
export const setPushNavigationCallback = (callback: NavigationCallback) => {
  navigationCallback = callback;
  console.log('[Push] Navigation callback registered');
};

/**
 * Initialize push notification configuration
 */
export const initializePushNotifications = async () => {
  // Configure notification channel for Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SideBet Notifications',
      description: 'Notifications for betting activities and social interactions',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
      enableVibrate: true,
      enableLights: true,
    });

    // High priority channel for urgent notifications
    await Notifications.setNotificationChannelAsync('urgent', {
      name: 'Urgent SideBet Notifications',
      description: 'High priority notifications for time-sensitive betting events',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF0000',
      sound: 'default',
      enableVibrate: true,
      enableLights: true,
    });
  }
};

/**
 * Handle notification taps and deep linking
 * Uses the navigation callback to actually navigate to the appropriate screen
 */
export const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
  const data = response.notification.request.content.data;

  console.log('[Push] Notification tapped:', data);

  if (!navigationCallback) {
    console.warn('[Push] Navigation callback not set - cannot navigate');
    return;
  }

  // Extract notification type and data from the push notification payload
  const notificationType = data?.type as NotificationType;
  const navigationData = {
    notificationId: data?.notificationId,
    actionType: data?.actionType,
    actionData: data?.actionData,
    relatedBetId: data?.relatedBetId,
    relatedUserId: data?.relatedUserId,
  };

  if (notificationType) {
    console.log('[Push] Triggering navigation for type:', notificationType);
    navigationCallback(notificationType, navigationData);
  } else {
    console.warn('[Push] No notification type in push data - cannot determine navigation');
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