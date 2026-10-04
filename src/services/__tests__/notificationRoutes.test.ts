import { describe, expect, it } from 'vitest';
import { getNotificationNavigationAction } from '../../utils/notificationNavigationHandler';
import { notificationRoute } from '../notificationRoutes';
import type { NotificationType } from '../../types/betting';

const now = () => 1234;

/** The route a notification type ends up at, through the real action mapping. */
const routeFor = (type: string, data: Record<string, unknown> = {}, from: 'push' | 'feed' = 'push') =>
  notificationRoute(getNotificationNavigationAction(type as NotificationType, data), from, now);

describe('notificationRoute', () => {
  it('opens Friends with the requests list for a friend request', () => {
    expect(routeFor('FRIEND_REQUEST_RECEIVED', { relatedUserId: 'u-2' })).toEqual({
      tab: 'Account',
      params: { screen: 'Friends', initial: false, params: { showRequests: 1234 } },
    });
  });

  it('opens Friends for an accepted or declined request, through the Account tab', () => {
    // Used to navigate to 'Friends' from the root, which only knows tabs: the tap did nothing
    for (const type of ['FRIEND_REQUEST_ACCEPTED', 'FRIEND_REQUEST_DECLINED']) {
      expect(routeFor(type)).toEqual({ tab: 'Account', params: { screen: 'Friends', initial: false } });
    }
  });

  it('sends money notifications to the Wallet', () => {
    for (const type of ['DEPOSIT_COMPLETED', 'DEPOSIT_FAILED', 'WITHDRAWAL_COMPLETED', 'WITHDRAWAL_FAILED', 'PAYMENT_METHOD_VERIFIED']) {
      expect(routeFor(type)).toEqual({ tab: 'Account', params: { screen: 'Wallet', initial: false } });
    }
  });

  it('opens the bet for bet activity, from push as well as the feed', () => {
    for (const type of ['BET_JOINED', 'BET_RESOLVED', 'BET_DISPUTED', 'BET_DEADLINE_APPROACHING', 'BET_INVITATION_RECEIVED']) {
      for (const from of ['push', 'feed'] as const) {
        expect(routeFor(type, { relatedBetId: 'bet-1' }, from)).toEqual({
          tab: 'Bets',
          params: { screen: 'BetDetails', initial: false, params: { betId: 'bet-1' } },
        });
      }
    }
  });

  it('falls back to the bets list when a bet notification has no bet id', () => {
    expect(routeFor('BET_RESOLVED')).toEqual({ tab: 'Bets', params: { screen: 'BetsList' } });
  });

  it('opens the squares game through the Bets tab', () => {
    expect(routeFor('SQUARES_GAME_LIVE', { actionData: { squaresGameId: 'g-1' } })).toEqual({
      tab: 'Bets',
      params: { screen: 'SquaresGameDetail', initial: false, params: { gameId: 'g-1' } },
    });
    expect(routeFor('SQUARES_GAME_LIVE')).toEqual({ tab: 'Bets', params: { screen: 'BetsList' } });
  });

  it('sends cancelled and invitation-answered bets to the bets list', () => {
    for (const type of ['BET_CANCELLED', 'BET_INVITATION_ACCEPTED', 'SQUARES_GAME_CANCELLED']) {
      expect(routeFor(type)).toEqual({ tab: 'Bets', params: { screen: 'BetsList' } });
    }
  });

  it('stays put in the feed for announcements, and lands on Account from a push', () => {
    expect(routeFor('SYSTEM_ANNOUNCEMENT', {}, 'feed')).toBeNull();
    expect(routeFor('SYSTEM_ANNOUNCEMENT', {}, 'push')).toEqual({
      tab: 'Account',
      params: { screen: 'AccountHome' },
    });
  });

  it('ignores refresh and none', () => {
    expect(notificationRoute({ action: 'refresh' }, 'push')).toBeNull();
    expect(notificationRoute({ action: 'none' }, 'push')).toBeNull();
  });
});
