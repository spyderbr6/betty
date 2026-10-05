import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Buying squares.
 *
 * One request: the server's buySquares checks the game is open, the squares are
 * free and the balance covers them, then writes one purchase row per square, the
 * debit and the game's counts in one transaction, and locks a full grid with
 * numbers it draws itself. The phone used to create the rows, debit in a separate
 * call, update the counts with a read-then-write and, for the buyer who filled the
 * grid, draw the numbers that decide every winner.
 */

const GAME_ID = 'squares-open';
const now = new Date().toISOString();

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
  locksAt: new Date(Date.now() + 86_400_000).toISOString(),
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
  scheduledTime: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: now,
  updatedAt: now,
};

const friendship = { id: 'friendship-1', user1Id: TEST_USER.userId, user2Id: OTHER_USER.id, createdAt: now };

/** The writes the phone used to make; none may happen now. */
const CLIENT_WRITES = ['createSquaresPurchase', 'updateSquaresPurchase', 'createTransaction', 'updateUser', 'updateSquaresGame'];

const handlers = (buySquares: (variables: Record<string, unknown>) => unknown) =>
  baseHandlers(
    {
      friendshipsByUser1: () => ({ items: [friendship], nextToken: null }),
      friendshipsByUser2: () => ({ items: [], nextToken: null }),
      squaresGamesByStatus: (variables) => ({ items: variables.status === 'ACTIVE' ? [game] : [], nextToken: null }),
      getSquaresGame: () => game,
      getLiveEvent: () => event,
      purchasesBySquaresGame: list(),
      payoutsBySquaresGame: list(),
      squaresInvitationsByGame: list(),
      buySquares,
    },
    { balance: 100 }
  );

/** From the Join tab to the game, two squares picked, the owner named, confirmed. */
const buyTwoSquares = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-live').dispatchEvent('click');
  await expect(page.getByTestId(`squares-card-${GAME_ID}`)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`squares-card-${GAME_ID}`).dispatchEvent('click');

  await expect(page.getByTestId('squares-cell-0-0')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('squares-cell-0-0').dispatchEvent('click');
  await page.getByTestId('squares-cell-3-7').dispatchEvent('click');
  await page.getByTestId('squares-buy').dispatchEvent('click');

  await page.getByTestId('squares-owner-name').fill('Mom');
  await page.getByTestId('squares-confirm-purchase').dispatchEvent('click');
};

test('buying squares sends the squares and the owner, and writes nothing else', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  const { calls } = await mockAppSync(
    page,
    handlers((variables) => {
      sent.push(variables);
      return JSON.stringify({ status: 'bought', squares: 2, total: 10, balance: 90, locked: false });
    })
  );

  await buyTwoSquares(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Purchase Successful', { timeout: 15_000 });
  expect(sent).toHaveLength(1);
  expect(sent[0].squaresGameId).toBe(GAME_ID);
  expect(sent[0].ownerName).toBe('Mom');
  expect(JSON.parse(sent[0].squares as string)).toEqual([{ row: 0, col: 0 }, { row: 3, col: 7 }]);
  for (const write of CLIENT_WRITES) expect(calls).not.toContain(write);
});

test('a square someone else just bought is named in the refusal', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    handlers(() => JSON.stringify({ status: 'refused', reason: 'SQUARE_TAKEN', taken: [{ row: 3, col: 7 }] }))
  );

  await buyTwoSquares(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Purchase Failed', { timeout: 15_000 });
  await expect(page.getByTestId('alert-message')).toContainText('D8');
});
