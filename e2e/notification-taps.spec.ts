import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Tapping a notification in the feed (behind the header bell) goes where it is about.
 *
 * actionData is an AWSJSON field: AppSync returns it as JSON text, which is how the feed
 * receives it. Squares notifications carry only their game id there, so the router used
 * to read `actionData.squaresGameId` off a string, get nothing, and open the bets list.
 */

const now = new Date().toISOString();
const GAME_ID = 'squares-tapped';

const game = {
  id: GAME_ID,
  title: 'Chiefs vs Bills Squares',
  creatorId: OTHER_USER.id,
  eventId: 'event-1',
  status: 'ACTIVE',
  pricePerSquare: 5,
  totalPot: 0,
  squaresSold: 0,
  numbersAssigned: false,
  isPrivate: false,
  payoutStructure: JSON.stringify({ period1: 0.15, period2: 0.25, period3: 0.15, period4: 0.45 }),
  locksAt: new Date(Date.now() + 1_800_000).toISOString(),
  createdAt: now,
  updatedAt: now,
};

const event = {
  id: 'event-1',
  externalId: 'espn-1',
  sport: 'NFL',
  homeTeam: 'Chiefs',
  awayTeam: 'Bills',
  status: 'UPCOMING',
  scheduledTime: game.locksAt,
  createdAt: now,
  updatedAt: now,
};

const note = (id: string, type: string, category: string, extra: Record<string, unknown> = {}) => ({
  id,
  userId: TEST_USER.userId,
  type,
  category,
  title: `title-${id}`,
  message: `message-${id}`,
  isRead: false,
  priority: 'HIGH',
  createdAt: now,
  ...extra,
});

const openFeed = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('header-notifications').first().dispatchEvent('click');
};

test('a squares reminder in the feed opens its game', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    baseHandlers({
      notificationsByUser: list([
        note('reminder', 'SQUARES_INVITATION_REMINDER', 'REMINDERS', {
          actionData: JSON.stringify({ squaresGameId: GAME_ID }),
        }),
      ]),
      updateNotification: (variables) => ({ ...note('reminder', 'SQUARES_INVITATION_REMINDER', 'REMINDERS'), ...(variables.input as object) }),
      getSquaresGame: () => game,
      getLiveEvent: () => event,
      purchasesBySquaresGame: list(),
      payoutsBySquaresGame: list(),
      squaresInvitationsByGame: list(),
    })
  );

  await openFeed(page);
  await expect(page.getByTestId('notification-item-reminder')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('notification-item-reminder').dispatchEvent('click');

  // The game's grid, not the bets list
  await expect(page.getByTestId('squares-cell-0-0')).toBeVisible({ timeout: 15_000 });
});

test('a bet waiting for its winner opens the Results tab, where the winner is picked', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    baseHandlers({
      notificationsByUser: list([
        note('pick', 'BET_RESOLUTION_NEEDED', 'ACTION_NEEDED', { relatedBetId: 'bet-closed' }),
      ]),
      updateNotification: (variables) => ({ ...note('pick', 'BET_RESOLUTION_NEEDED', 'ACTION_NEEDED'), ...(variables.input as object) }),
    })
  );

  await openFeed(page);
  await expect(page.getByTestId('notification-item-pick')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('notification-item-pick').dispatchEvent('click');

  await expect(page.getByTestId('screen-resolve')).toBeVisible({ timeout: 15_000 });
});
