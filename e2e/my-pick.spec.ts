import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { baseHandlers, bet } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * A bet card marks the option you picked (JOINED, with your stake).
 *
 * The app reads your participant rows once, at load. A bet you join or create later
 * arrives by subscription naming you in participantUserIds but without your row, so the
 * card used to show you in the bet with no pick. BetDataContext now reads each missing
 * row by its fixed id (betId#userId) and the card marks the pick.
 */

const pool = bet({
  id: 'bet-pool',
  title: 'Who wins the Super Bowl?',
  odds: JSON.stringify({ sideAName: 'Chiefs', sideBName: 'Bills', options: ['Chiefs', 'Bills', 'Eagles'] }),
  sideACount: 1,
  sideBCount: 0,
  sideCCount: 1,
  participantUserIds: ['someone-else', TEST_USER.userId],
  creatorId: 'someone-else',
  creatorName: 'Someone Else',
});
const row = (betId: string, side: string) => ({
  id: `${betId}#${TEST_USER.userId}`,
  betId,
  userId: TEST_USER.userId,
  side,
  amount: 25,
  joinedAt: new Date().toISOString(),
});

const openMyBets = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
};

const handlers = (over: Record<string, (variables: Record<string, unknown>) => unknown>) =>
  baseHandlers({
    betsByStatus: (variables) => ({ items: variables.status === 'ACTIVE' ? [pool] : [], nextToken: null }),
    getBet: () => pool,
    ...over,
  });

test("a pool card marks the option you picked when it is loaded with the app", async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, handlers({ participantsByUser: list([row('bet-pool', 'C')]) }));
  await openMyBets(page);

  await expect(page.getByText('You • $25 •')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('JOINED')).toHaveCount(1);
});

test('a bet you are in without a loaded pick reads it by id and marks it', async ({ page }) => {
  await signInAs(page);
  const asked: unknown[] = [];
  await mockAppSync(
    page,
    handlers({
      // Joined after the load: no row came back with the others
      participantsByUser: list([]),
      getParticipant: (variables) => {
        asked.push(variables.id);
        return row('bet-pool', 'C');
      },
    }),
  );
  await openMyBets(page);

  await expect(page.getByText('You • $25 •')).toBeVisible({ timeout: 15_000 });
  expect(asked).toEqual([`bet-pool#${TEST_USER.userId}`]);
});
