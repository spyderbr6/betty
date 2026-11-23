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
 * actionData as an object. It is stored as JSON text (an AWSJSON field), and the feed and
 * the in-app banner hand it over as read, so a squares notification's game id used to be
 * unreadable there and the tap fell back to the bets list. Push data arrives parsed.
 */
export function parseActionData(actionData: unknown): Record<string, unknown> {
  let value = actionData;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Get navigation action for a notification type
 * Returns the screen/modal to navigate to and any params needed
 */
export function getNotificationNavigationAction(
  type: NotificationType,
  rawData?: NotificationNavigationData
): {
  action: 'navigate' | 'open_modal' | 'refresh' | 'none';
  screen?: string;
  modal?: string;
  params?: any;
} {
  const data = rawData && { ...rawData, actionData: parseActionData(rawData.actionData) };
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

    // The winner is picked on the Results tab
    case 'BET_RESOLUTION_NEEDED':
      return {
        action: 'navigate',
        screen: 'Resolve',
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

    // The Wallet calls out a failed Pro payment and links to managing it
    case 'SUBSCRIPTION_PAYMENT_FAILED':
      return {
        action: 'navigate',
        screen: 'Account',
        params: {
          openWallet: true,
        },
      };

    // System Announcements
    case 'SYSTEM_ANNOUNCEMENT':
      return {
        action: 'open_modal',
        modal: 'notifications',
      };

    // Squares Invitation Notifications
    case 'SQUARES_INVITATION_RECEIVED':
      return {
        action: 'navigate',
        screen: 'SquaresGameDetail',
        params: {
          gameId: data?.actionData?.squaresGameId,
        },
      };

    case 'SQUARES_INVITATION_ACCEPTED':
    case 'SQUARES_INVITATION_DECLINED':
    case 'SQUARES_INVITATION_REMINDER':
      return {
        action: 'navigate',
        screen: 'SquaresGameDetail',
        params: {
          gameId: data?.actionData?.squaresGameId,
        },
      };

    // Squares Game Notifications
    case 'SQUARES_GRID_LOCKED':
    case 'SQUARES_GAME_LIVE':
    case 'SQUARES_PERIOD_WINNER':
    case 'SQUARES_PURCHASE_CONFIRMED':
      return {
        action: 'navigate',
        screen: 'SquaresGameDetail',
        params: {
          gameId: data?.actionData?.squaresGameId,
        },
      };

    case 'SQUARES_GAME_CANCELLED':
      return {
        action: 'navigate',
        screen: 'MyBets',
        params: {
          tab: 'squares',
        },
      };

    default: {
      // Every catalogued type has a case above: a new type without one fails to compile.
      // This is reached only by a type the app does not know (a newer server).
      const unknown: never = type;
      console.warn(`[NotificationNavigation] Unknown notification type: ${unknown}`);
      return {
        action: 'open_modal',
        modal: 'notifications',
      };
    }
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
    'BET_RESOLUTION_NEEDED': 'Tap to pick the winner',
    'DEPOSIT_COMPLETED': 'Tap to view transaction history',
    'DEPOSIT_FAILED': 'Tap to view transaction history',
    'WITHDRAWAL_COMPLETED': 'Tap to view transaction history',
    'WITHDRAWAL_FAILED': 'Tap to view transaction history',
    'SUBSCRIPTION_PAYMENT_FAILED': 'Tap to view your wallet',
    'SYSTEM_ANNOUNCEMENT': 'Tap to view details',
    'SQUARES_INVITATION_RECEIVED': 'Tap to view invitation',
    'SQUARES_INVITATION_ACCEPTED': 'Tap to view game',
    'SQUARES_INVITATION_DECLINED': 'Tap to view game',
    'SQUARES_INVITATION_REMINDER': 'Tap to pick your squares',
    'SQUARES_GRID_LOCKED': 'Tap to view grid',
    'SQUARES_PERIOD_WINNER': 'Tap to view game',
    'SQUARES_GAME_LIVE': 'Tap to view game',
    'SQUARES_GAME_CANCELLED': 'Tap to view your games',
    'SQUARES_PURCHASE_CONFIRMED': 'Tap to view game',
  };

  return descriptions[type] || 'Tap to view notification';
}
