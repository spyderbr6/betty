/**
 * Where a notification tap goes, as a tab plus nested params for navigation.navigate.
 *
 * Both routers use this: push and toast taps (AppNavigator, from the top of the app) and
 * the in-app feed (NotificationScreen). They used to map getNotificationNavigationAction's
 * results separately and disagreed. Push sent screen names like 'Friends', 'MyBets' and
 * 'SquaresGameDetail' straight to the root navigator, which only knows tabs, so those taps
 * did nothing. Push opened the Results tab for a bet notification where the feed opened
 * the bet. And payment notifications asked for the transaction history, which nothing
 * read.
 *
 * Pure, so it is unit tested; no navigation runtime imports.
 */

export interface NotificationAction {
  action: 'navigate' | 'open_modal' | 'refresh' | 'none';
  screen?: string;
  modal?: string;
  params?: Record<string, unknown>;
}

export interface NotificationRoute {
  tab: 'Bets' | 'Resolve' | 'Create' | 'Live' | 'Account';
  /**
   * The page inside the tab. initial: false keeps the tab's home page underneath when the
   * tab has not been opened yet, so back from the notification's page has somewhere to go
   * (otherwise React Navigation makes the target the only page in the stack).
   */
  params?: { screen: string; params?: Record<string, unknown>; initial?: false };
}

const BETS_HOME: NotificationRoute = { tab: 'Bets', params: { screen: 'BetsList' } };

/**
 * @param from 'push' for push and toast taps; 'feed' when the tap is in the notification
 *   feed itself, where "open the notifications" means stay put.
 * @param now timestamp source for Friends' showRequests (see AccountStackParamList).
 */
export function notificationRoute(
  action: NotificationAction,
  from: 'push' | 'feed',
  now: () => number = Date.now
): NotificationRoute | null {
  const params = action.params ?? {};

  if (action.action === 'navigate') {
    switch (action.screen) {
      case 'Friends':
        return { tab: 'Account', params: { screen: 'Friends', initial: false } };
      case 'MyBets':
        return BETS_HOME;
      case 'SquaresGameDetail':
        return params.gameId
          ? { tab: 'Bets', params: { screen: 'SquaresGameDetail', initial: false, params: { gameId: params.gameId } } }
          : BETS_HOME;
      case 'Account':
        // Deposits, withdrawals and payment method changes: the Wallet is where those live
        if (params.openTransactionHistory || params.openPaymentMethods) {
          return { tab: 'Account', params: { screen: 'Wallet', initial: false } };
        }
        return { tab: 'Account', params: { screen: 'AccountHome' } };
      default:
        return null;
    }
  }

  if (action.action === 'open_modal') {
    switch (action.modal) {
      case 'friend_requests':
        return { tab: 'Account', params: { screen: 'Friends', initial: false, params: { showRequests: now() } } };
      case 'bet_details':
      case 'bet_invitation':
        return params.betId
          ? { tab: 'Bets', params: { screen: 'BetDetails', initial: false, params: { betId: params.betId } } }
          : BETS_HOME;
      case 'notifications':
        // The feed lives behind the header bell, not a route; from a push, land on Account
        return from === 'feed' ? null : { tab: 'Account', params: { screen: 'AccountHome' } };
      default:
        return null;
    }
  }

  return null;
}
