import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, bet } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Resolving a bet.
 *
 * Resolution is one call: the server's resolveBet checks the caller created the
 * bet, computes every payout and fee from the stakes (Pro looked up on the
 * server), and records the winner, the dispute window, each participant's outcome
 * and the pending winnings. The creator's phone used to compute and write all of
 * that, which is why these tests used to inspect the transactions it wrote; the
 * fee rules are now unit tests of the server's plan (amplify/shared/__tests__/
 * resolveLogic.test.ts). What is left to pin here is that the phone sends the
 * choice and writes nothing else.
 */

const BET_ID = 'bet-resolving';

/** A bet the viewer created, expired, awaiting their decision. */
const pendingBet = () =>
  bet({
    id: BET_ID,
    status: 'PENDING_RESOLUTION',
    creatorId: TEST_USER.userId,
    creatorName: TEST_USER.displayName,
    // No winner yet: that is what the resolution prompt is for.
    winningSide: null,
    totalPot: 50,
    betAmount: 25,
    sideACount: 1,
    sideBCount: 1,
    participantUserIds: [TEST_USER.userId, OTHER_USER.id],
  });

const participants = [
  { id: 'participant-me', betId: BET_ID, userId: TEST_USER.userId, side: 'A', amount: 25, status: 'ACCEPTED' },
  { id: 'participant-them', betId: BET_ID, userId: OTHER_USER.id, side: 'B', amount: 25, status: 'ACCEPTED' },
];

/** The writes the phone used to make at resolution; none may happen now. */
const CLIENT_WRITES = ['createTransaction', 'updateUser', 'updateParticipant', 'updateBet', 'createNotification'];

const handlers = (resolveBet: (variables: Record<string, unknown>) => unknown) =>
  baseHandlers({
    betsByCreator: (variables) =>
      variables.creatorId === TEST_USER.userId
        ? { items: [pendingBet()], nextToken: null }
        : { items: [], nextToken: null },
    participantsByUser: list([participants[0]]),
    participantsByBet: list(participants),
    resolveBet,
  });

const openResolveTab = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-resolve').dispatchEvent('click');
  await expect(page.getByTestId('screen-resolve')).toBeVisible({ timeout: 15_000 });
};

/** Pick the winning side and commit. */
const resolveAsSideA = async (page: Page) => {
  await page.getByTestId(`resolve-side-A-${BET_ID}`).dispatchEvent('click');
  await page.getByTestId(`resolve-confirm-${BET_ID}`).dispatchEvent('click');
};

test('resolving sends the winner to the server and writes nothing else', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  const { calls } = await mockAppSync(
    page,
    handlers((variables) => {
      sent.push(variables);
      return JSON.stringify({ status: 'resolved', winningSide: 'A', disputeWindowEndsAt: new Date().toISOString(), winners: 1, refundedNoWinners: false });
    })
  );

  await openResolveTab(page);
  await resolveAsSideA(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Bet Resolved', { timeout: 15_000 });
  await expect(page.getByTestId('alert-message')).toContainText('48-hour dispute window');
  expect(sent).toEqual([{ betId: BET_ID, winningSide: 'A' }]);
  for (const write of CLIENT_WRITES) expect(calls).not.toContain(write);
});

test('a resolution the server refuses explains why', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, handlers(() => JSON.stringify({ status: 'refused', reason: 'NOT_RESOLVABLE' })));

  await openResolveTab(page);
  await resolveAsSideA(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Already Resolved', { timeout: 15_000 });
});

test('a resolution that fails outright says so', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, handlers(() => null));

  await openResolveTab(page);
  await resolveAsSideA(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Error', { timeout: 15_000 });
  for (const write of CLIENT_WRITES) expect(calls).not.toContain(write);
});
