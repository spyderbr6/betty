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
      // Indexed query; the friendships Scan is gone. The handler keys off which
      // side the filter asked about, so the user does not become their own friend.
      friendshipsByUser1: () => ({ items: [friendship], nextToken: null }),
      friendshipsByUser2: () => ({ items: [], nextToken: null }),
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

/**
 * Handlers for the write path. A successful join touches seven operations, which
 * is why the guard tests above stop short of it: createParticipant, then the
 * transaction (Transaction.create plus the User.update that debits the balance),
 * then Bet.update for the denormalised counts, then the creator's notification.
 */
const joinWrites = (over: Record<string, (v: Record<string, unknown>) => unknown> = {}) => ({
  createParticipant: () => ({ id: 'participant-1', status: 'ACCEPTED' }),
  createTransaction: () => ({ id: 'transaction-1', status: 'COMPLETED' }),
  updateUser: (variables: Record<string, unknown>) => ({ ...variables }),
  updateBet: (variables: Record<string, unknown>) => ({ ...variables }),
  deleteParticipant: (variables: Record<string, unknown>) => ({ ...variables }),
  createNotification: () => ({ id: 'notification-1' }),
  ...over,
});

const confirmJoin = async (page: Page) => {
  await expect(page.getByTestId('join-side-a')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('join-side-a').dispatchEvent('click');
  await expect(page.getByTestId('alert-title')).toHaveText('Join Bet');
  await page.getByTestId('alert-button-join').dispatchEvent('click');
};

test('a successful join takes the stake and marks the bet joined', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, {
    ...withOpenBet({ betAmount: 25 }, { balance: 250 }),
    ...joinWrites(),
  });
  await openLiveTab(page);

  await confirmJoin(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Joined Successfully!');
  // The confirmation quotes the balance after the debit, so it is worth pinning:
  // 250 - 25. A wrong figure here means the wrong amount left the account.
  await expect(page.getByTestId('alert-message')).toContainText('$225.00');

  expect(calls).toContain('createParticipant');
  expect(calls).toContain('createTransaction');
  expect(calls).toContain('updateBet');

  // The card itself has to reflect it, not just the alert: the join controls are
  // replaced by a JOINED marker once the side is recorded locally.
  await expect(page.getByTestId('join-side-a')).toBeHidden();
  await expect(page.getByTestId('bet-card-bet-open')).toContainText('JOINED');
});

test('a failed transaction deletes the participant it just created', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, {
    ...withOpenBet({ betAmount: 25 }, { balance: 250 }),
    // The participant row is written first, so a transaction that fails after it
    // would otherwise leave a participant in a bet they never paid into.
    ...joinWrites({ createTransaction: () => null }),
  });
  await openLiveTab(page);

  await confirmJoin(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Error');
  expect(calls).toContain('createParticipant');
  expect(calls).toContain('deleteParticipant');
  // Never reached: the bet must not be updated when the stake was not taken.
  expect(calls).not.toContain('updateBet');
});
