/**
 * Notification Navigation Handler
 * Handles navigation actions when users tap on toast notifications
 */

import { NotificationType } from '../types/betting';

export interface NotificationNavigationData {
  notificationId?: string;
  actionType?: string;
  actionData?: any;
  relatedBetId?: string;
  relatedUserId?: string;
  action?: string; // For batch notifications
}

/**
 * Get navigation action for a notification type
 * Returns the screen/modal to navigate to and any params needed
 */
export function getNotificationNavigationAction(
  type: NotificationType,
  data?: NotificationNavigationData
): {
  action: 'navigate' | 'open_modal' | 'refresh' | 'none';
  screen?: string;
  modal?: string;
  params?: any;
} {
  // Handle batch notification (view all)
  if (data?.action === 'view_all_notifications') {
    return {
      action: 'open_modal',
      modal: 'notifications',
    };
  }

  switch (type) {
    // Friend Request Notifications
    case 'FRIEND_REQUEST_RECEIVED':
      return {
        action: 'open_modal',
        modal: 'friend_requests',
        params: {
          requestId: data?.relatedUserId,
        },
      };

    case 'FRIEND_REQUEST_ACCEPTED':
    case 'FRIEND_REQUEST_DECLINED':
      return {
        action: 'navigate',
        screen: 'Friends',
        params: {
          userId: data?.relatedUserId,
        },
      };

    // Bet Invitation Notifications
    case 'BET_INVITATION_RECEIVED':
      return {
        action: 'open_modal',
        modal: 'bet_invitation',
        params: {
          betId: data?.relatedBetId,
          invitationId: data?.actionData?.invitationId,
        },
      };

    case 'BET_INVITATION_ACCEPTED':
    case 'BET_INVITATION_DECLINED':
      return {
        action: 'navigate',
        screen: 'MyBets',
        params: {
          betId: data?.relatedBetId,
        },
      };

    // Bet Activity Notifications
    case 'BET_JOINED':
      return {
        action: 'open_modal',
        modal: 'bet_details',
        params: {
          betId: data?.relatedBetId,
        },
      };

    case 'BET_RESOLVED':
      return {
        action: 'open_modal',
        modal: 'bet_details',
        params: {
          betId: data?.relatedBetId,
          highlightResult: true,
        },
      };

    case 'BET_CANCELLED':
      return {
        action: 'navigate',
        screen: 'MyBets',
        params: {
          betId: data?.relatedBetId,
        },
      };

    case 'BET_DISPUTED':
      return {
        action: 'open_modal',
        modal: 'bet_details',
        params: {
          betId: data?.relatedBetId,
          showDispute: true,
        },
      };

    case 'BET_DEADLINE_APPROACHING':
      return {
        action: 'open_modal',
        modal: 'bet_details',
        params: {
          betId: data?.relatedBetId,
        },
      };

    // Payment Notifications
    case 'DEPOSIT_COMPLETED':
    case 'DEPOSIT_FAILED':
    case 'WITHDRAWAL_COMPLETED':
    case 'WITHDRAWAL_FAILED':
      return {
        action: 'navigate',
        screen: 'Account',
        params: {
          openTransactionHistory: true,
        },
      };

    case 'PAYMENT_METHOD_VERIFIED':
      return {
        action: 'navigate',
        screen: 'Account',
        params: {
          openPaymentMethods: true,
        },
      };

    // System Announcements
    case 'SYSTEM_ANNOUNCEMENT':
      return {
        action: 'open_modal',
        modal: 'notifications',
      };

    default:
      console.warn(`[NotificationNavigation] Unknown notification type: ${type}`);
      return {
        action: 'open_modal',
        modal: 'notifications',
      };
  }
}

/**
 * Get human-readable action description for a notification type
 */
export function getNotificationActionDescription(type: NotificationType): string {
  const descriptions: Record<NotificationType, string> = {
    'FRIEND_REQUEST_RECEIVED': 'Tap to view friend request',
    'FRIEND_REQUEST_ACCEPTED': 'Tap to view friend',
    'FRIEND_REQUEST_DECLINED': 'Tap to view friends',
    'BET_INVITATION_RECEIVED': 'Tap to view bet invitation',
    'BET_INVITATION_ACCEPTED': 'Tap to view bet',
    'BET_INVITATION_DECLINED': 'Tap to view your bets',
    'BET_JOINED': 'Tap to view bet details',
    'BET_RESOLVED': 'Tap to view results',
    'BET_CANCELLED': 'Tap to view your bets',
    'BET_DISPUTED': 'Tap to view dispute',
    'BET_DEADLINE_APPROACHING': 'Tap to view bet',
    'DEPOSIT_COMPLETED': 'Tap to view transaction history',
    'DEPOSIT_FAILED': 'Tap to view transaction history',
    'WITHDRAWAL_COMPLETED': 'Tap to view transaction history',
    'WITHDRAWAL_FAILED': 'Tap to view transaction history',
    'PAYMENT_METHOD_VERIFIED': 'Tap to view payment methods',
    'SYSTEM_ANNOUNCEMENT': 'Tap to view details',
  };

  return descriptions[type] || 'Tap to view notification';
}
