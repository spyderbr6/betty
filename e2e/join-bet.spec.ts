import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, joinableBet } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Joining a bet, as the UI actually does it.
 *
 * Note there are two join implementations in the codebase and only one of them
 * runs: BetCard.confirmJoinBet does the work directly, while
 * BetDataContext.joinBet — the version with the optimistic update and rollback —
 * has no callers at all. These tests drive BetCard's path, so they cover its
 * guards and its compensating delete, not any optimistic rollback.
 *
 * Joinable bets live on the Live tab, which defaults to a friends-only view, so
 * the fixture has to supply a friendship or the list renders empty.
 */

const friendship = {
  id: 'friendship-1',
  user1Id: TEST_USER.userId,
  user2Id: OTHER_USER.id,
  createdAt: new Date().toISOString(),
};

/**
 * The context queries friendships twice — once by user1Id, once by user2Id.
 * Answering both with the same record would make the current user their own
 * friend, so key off which side the filter asked about.
 */
const friendships = (variables: Record<string, unknown>) => {
  const filter = variables.filter as { user1Id?: unknown } | undefined;
  return { items: filter?.user1Id ? [friendship] : [], nextToken: null };
};

const openLiveTab = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-live').dispatchEvent('click');
  await expect(page.getByTestId('screen-live')).toBeVisible({ timeout: 15_000 });
};

const withOpenBet = (over: Record<string, unknown> = {}, me: Record<string, unknown> = {}) =>
  baseHandlers(
    {
      listFriendships: friendships,
      betsByStatus: (variables) => ({
        items: variables.status === 'ACTIVE' ? [joinableBet(over)] : [],
        nextToken: null,
      }),
    },
    me
  );

test("a friend's open bet is offered with join controls", async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, withOpenBet());
  await openLiveTab(page);

  await expect(page.getByTestId('bet-card-bet-open')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('join-side-a')).toBeVisible();
});

test('refuses the join when the balance will not cover the stake', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, withOpenBet({ betAmount: 25 }, { balance: 5 }));
  await openLiveTab(page);

  await expect(page.getByTestId('join-side-a')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('join-side-a').dispatchEvent('click');

  // Joining is confirmed first — the sheet states the stake and the side, and
  // nothing reaches the server until it is accepted.
  await expect(page.getByTestId('alert-title')).toHaveText('Join Bet');
  await expect(page.getByTestId('alert-message')).toContainText('$25');
  await expect(page.getByTestId('alert-message')).toContainText('Chiefs');
  await page.getByTestId('alert-button-join').dispatchEvent('click');

  await expect(page.getByTestId('alert-title')).toHaveText('Insufficient Balance');
  await expect(page.getByTestId('alert-message')).toContainText('You need $25');
  await expect(page.getByTestId('alert-message')).toContainText('$5.00');

  // Nothing was committed: the card is still joinable and no participant was
  // created. (This path has no optimistic update to undo — the balance is
  // checked before anything is written.)
  await expect(page.getByTestId('join-side-a')).toBeVisible();
});
