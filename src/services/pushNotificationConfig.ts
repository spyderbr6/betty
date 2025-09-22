/**
 * Push Notification Configuration
 * Configure Expo notifications for the app
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications are handled when the app is running
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
 */
export const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
  const data = response.notification.request.content.data;

  console.log('Notification tapped:', data);

  // Handle deep linking based on notification data
  if (data?.actionType) {
    switch (data.actionType) {
      case 'view_bet':
        // Navigate to bet details
        console.log('Navigate to bet:', data.relatedBetId);
        break;
      case 'view_friend_requests':
        // Navigate to friend requests
        console.log('Navigate to friend requests');
        break;
      case 'view_bet_invitation':
        // Navigate to bet invitation
        console.log('Navigate to bet invitation:', data.actionData);
        break;
      case 'view_friends':
        // Navigate to friends screen
        console.log('Navigate to friends');
        break;
      default:
        console.log('Unknown notification action:', data.actionType);
    }
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