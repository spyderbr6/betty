import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, joinableBet } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Joining a bet, as the UI actually does it.
 *
 * The join is one call: the server's joinBet mutation checks it and writes the
 * participant row, the stake and the bet's counts in one transaction
 * (amplify/shared/joinLogic.ts). The app used to make those writes itself, so
 * these tests now pin that it makes none of them: whatever joinBet answers, the
 * card shows it, and no Participant, Transaction, User or Bet write leaves the
 * phone.
 *
 * Joinable bets live on the Live tab, which defaults to a friends-only view, so
 * the fixture has to supply a friendship or the list renders empty.
 */

/** The writes the app used to make itself; none may happen now. */
const CLIENT_MONEY_WRITES = ['createParticipant', 'createTransaction', 'updateUser', 'updateBet', 'deleteParticipant'];

/** joinBet returns AWSJSON: the answer arrives as JSON text. */
const joinAnswer = (answer: Record<string, unknown>) => () => JSON.stringify(answer);

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
  const { calls } = await mockAppSync(page, {
    ...withOpenBet({ betAmount: 25 }, { balance: 5 }),
    // The server checks the balance; the answer carries what it found
    joinBet: joinAnswer({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 5, required: 25 }),
  });
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

  // Nothing was committed: the card is still joinable, and the only write the
  // app attempted was the join request itself.
  await expect(page.getByTestId('join-side-a')).toBeVisible();
  expect(calls).toContain('joinBet');
  for (const write of CLIENT_MONEY_WRITES) expect(calls).not.toContain(write);
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
    joinBet: joinAnswer({ status: 'joined', participantId: 'bet-open#user', amount: 25, balance: 225 }),
  });
  await openLiveTab(page);

  await confirmJoin(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Joined Successfully!');
  // The confirmation quotes the balance the server reports after the debit, so
  // it is worth pinning: a wrong figure here means the wrong amount left.
  await expect(page.getByTestId('alert-message')).toContainText('$225.00');

  // One request; the server wrote the participant, the stake and the counts
  expect(calls).toContain('joinBet');
  for (const write of CLIENT_MONEY_WRITES) expect(calls).not.toContain(write);

  // The card itself has to reflect it, not just the alert: the join controls are
  // replaced by a JOINED marker once the side is recorded locally.
  await expect(page.getByTestId('join-side-a')).toBeHidden();
  await expect(page.getByTestId('bet-card-bet-open')).toContainText('JOINED');
});

test('a join the server refuses explains why and leaves the bet joinable', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, {
    ...withOpenBet({ betAmount: 25 }, { balance: 250 }),
    // The card was on screen past the deadline: the server, not the card, says no
    joinBet: joinAnswer({ status: 'refused', reason: 'EXPIRED' }),
  });
  await openLiveTab(page);

  await confirmJoin(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Bet Closed');
  await expect(page.getByTestId('join-side-a')).toBeVisible();
});

test('a join request that fails outright says so and changes nothing', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, {
    ...withOpenBet({ betAmount: 25 }, { balance: 250 }),
    joinBet: () => null,
  });
  await openLiveTab(page);

  await confirmJoin(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Error');
  await expect(page.getByTestId('join-side-a')).toBeVisible();
  for (const write of CLIENT_MONEY_WRITES) expect(calls).not.toContain(write);
});
