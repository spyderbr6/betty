import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { baseHandlers } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * The admin squares tab, which is the only in-app way to release money from a
 * squares game that cannot resolve itself.
 *
 * Squares resolution reads homePeriodScores and awayPeriodScores off the linked
 * LiveEvent. If the upstream feed never delivers them, the scheduled checker
 * skips the game on every run - silently, with no timeout and no alert - and the
 * game sits in PENDING_RESOLUTION with buyers' money in it.
 *
 * This tab lists games and can cancel one, which refunds every buyer. It used to
 * list only ACTIVE, LOCKED and LIVE, so the stuck games were the exact ones it
 * could not reach.
 */

const STUCK_GAME = {
  id: 'game-stuck',
  title: 'Chiefs vs Bills Squares',
  creatorId: TEST_USER.userId,
  eventId: 'event-1',
  status: 'PENDING_RESOLUTION',
  pricePerSquare: 5,
  totalPot: 100,
  squaresSold: 20,
  numbersAssigned: true,
  isPrivate: false,
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
};

const purchases = [
  { id: 'purchase-1', squaresGameId: STUCK_GAME.id, userId: 'user-buyer-1', amount: 50, gridRow: 1, gridCol: 1 },
  { id: 'purchase-2', squaresGameId: STUCK_GAME.id, userId: 'user-buyer-2', amount: 50, gridRow: 2, gridCol: 2 },
];

/** Amplify nests mutation fields under `input`; queries are flat. */
const fields = (variables: Record<string, any>): Record<string, any> =>
  (variables.input as Record<string, any>) ?? variables;

const handlers = (
  over: Record<string, (v: Record<string, unknown>) => unknown>,
  written: Record<string, unknown>[]
) =>
  baseHandlers(
    {
      squaresGamesByStatus: (variables) =>
        variables.status === 'PENDING_RESOLUTION'
          ? { items: [STUCK_GAME], nextToken: null }
          : { items: [], nextToken: null },
      purchasesBySquaresGame: list(purchases),
      payoutsBySquaresGame: list(),
      getSquaresGame: () => STUCK_GAME,
      updateSquaresGame: (variables) => ({ ...STUCK_GAME, ...fields(variables) }),
      createTransaction: (variables) => {
        written.push(variables);
        return { id: `transaction-${written.length}`, ...fields(variables) };
      },
      createNotification: (variables) => ({ id: 'notification-1', ...fields(variables) }),
      ...over,
    },
    // The tab only renders for an admin.
    { role: 'ADMIN' }
  );

const openSquaresTab = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
  // The admin entry only renders once AuthContext has loaded the role, so
  // clicking straight after the tab races it.
  const adminEntry = page.getByTestId('account-admin-dashboard');
  await expect(adminEntry).toBeVisible({ timeout: 15_000 });
  await adminEntry.dispatchEvent('click');
  await expect(page.getByTestId('screen-admin')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('admin-tab-squares').dispatchEvent('click');
};

test('a game stuck awaiting resolution is listed', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, handlers({}, []));

  await openSquaresTab(page);

  // The regression: PENDING_RESOLUTION was missing from the query, so a game
  // whose event never produced scores was invisible to the only tool that could
  // release its money.
  await expect(page.getByTestId(`admin-squares-${STUCK_GAME.id}`)).toBeVisible({ timeout: 15_000 });
});

test('cancelling a stuck game refunds every buyer', async ({ page }) => {
  await signInAs(page);
  const written: Record<string, unknown>[] = [];
  await mockAppSync(page, handlers({}, written));

  await openSquaresTab(page);
  await page.getByTestId(`admin-cancel-${STUCK_GAME.id}`).dispatchEvent('click');
  await page.getByTestId('admin-cancel-reason').fill('Final scores never arrived from the feed');
  await page.getByTestId('admin-confirm-cancel').dispatchEvent('click');

  await expect
    .poll(
      () => written.map(fields).filter((t) => t.type === 'SQUARES_REFUND').length,
      { timeout: 15_000 }
    )
    .toBe(2);

  const refunds = written.map(fields).filter((t) => t.type === 'SQUARES_REFUND');
  expect(refunds.map((r) => r.amount).sort()).toEqual([50, 50]);
});

/**
 * The double-payment guard is covered by unit tests on cancelRefusalReason, not
 * here. An e2e for it was written and deleted: it passed with the guard removed,
 * so it proved nothing. The cancel never reached the service in that scenario and
 * the assertion - "no refunds were written" - was satisfied for the wrong reason.
 * A green test that cannot fail is worse than no test.
 */
