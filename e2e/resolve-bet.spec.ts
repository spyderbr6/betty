import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, bet } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Resolving a bet, and what it charges.
 *
 * Pro waives the platform fee on winnings. Nothing that actually paid anyone
 * honoured that: ResolveScreen hardcoded 0.03 for the payout transaction and
 * again for the notification text, so a Pro member was charged and then told the
 * reduced figure. These drive the real screen and assert on the transaction it
 * writes, because that is the artefact the money follows - the fee is a field on
 * a record, not something visible in the UI.
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
    totalPot: 100,
    betAmount: 25,
    sideACount: 1,
    sideBCount: 1,
    participantUserIds: [TEST_USER.userId, OTHER_USER.id],
  });

const participants = [
  { id: 'participant-me', betId: BET_ID, userId: TEST_USER.userId, side: 'A', amount: 25, status: 'ACCEPTED' },
  { id: 'participant-them', betId: BET_ID, userId: OTHER_USER.id, side: 'B', amount: 25, status: 'ACCEPTED' },
];

/**
 * @param me profile overrides for the signed-in user, which is how Pro is set.
 * @param written every createTransaction the flow performs, for assertions.
 */
const handlers = (me: Record<string, unknown>, written: Record<string, unknown>[]) =>
  baseHandlers(
    {
      betsByCreator: (variables) =>
        variables.creatorId === TEST_USER.userId
          ? { items: [pendingBet()], nextToken: null }
          : { items: [], nextToken: null },
      participantsByUser: list([participants[0]]),
      participantsByBet: list(participants),
      updateBet: (variables) => ({ ...pendingBet(), ...variables }),
      updateParticipant: (variables) => variables,
      createTransaction: (variables) => {
        written.push(variables);
        return { id: `transaction-${written.length}`, ...variables };
      },
      createNotification: (variables) => ({ id: 'notification-1', ...variables }),
    },
    me
  );

const openResolveTab = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-resolve').dispatchEvent('click');
  await expect(page.getByTestId('screen-resolve')).toBeVisible({ timeout: 15_000 });
};

/** Pick the winning side and commit, which is what writes the payout. */
const resolveAsSideA = async (page: Page) => {
  await page.getByTestId(`resolve-side-A-${BET_ID}`).dispatchEvent('click');
  await page.getByTestId(`resolve-confirm-${BET_ID}`).dispatchEvent('click');
};

/**
 * Amplify sends mutation fields nested under `input`, unlike queries, which are
 * flat. Reading them flat finds every field undefined and quietly matches
 * nothing.
 */
const fields = (variables: Record<string, any>): Record<string, any> =>
  (variables.input as Record<string, any>) ?? variables;

/** The winner's payout record. The loser also gets one, of a different type. */
const winningsOf = (written: Record<string, unknown>[]) =>
  written.map(fields).find((t) => t.type === 'BET_WON' && t.userId === TEST_USER.userId);

test('a Pro member is charged no fee on winnings', async ({ page }) => {
  await signInAs(page);
  const written: Record<string, unknown>[] = [];
  await mockAppSync(
    page,
    handlers({ subscriptionTier: 'PRO', subscriptionStatus: 'ACTIVE' }, written)
  );

  await openResolveTab(page);
  await resolveAsSideA(page);

  await expect.poll(() => winningsOf(written), { timeout: 15_000 }).toBeDefined();

  const winnings = winningsOf(written)!;
  // Sole winner of a 100 pot, so the gross payout is the whole pot.
  expect(winnings.amount).toBe(100);
  expect(winnings.platformFee).toBe(0);
  expect(winnings.actualAmount).toBe(100);
});

test('a free member is charged the fee on winnings', async ({ page }) => {
  await signInAs(page);
  const written: Record<string, unknown>[] = [];
  await mockAppSync(page, handlers({ subscriptionTier: 'FREE' }, written));

  await openResolveTab(page);
  await resolveAsSideA(page);

  await expect
    .poll(() => winningsOf(written), { timeout: 15_000 })
    .toBeDefined();

  const winnings = winningsOf(written)!;
  // The inverse matters as much as the waiver: a fee of 0 for everyone would
  // satisfy the Pro test on its own.
  expect(winnings.amount).toBe(100);
  expect(winnings.platformFee).toBe(3);
  expect(winnings.actualAmount).toBe(97);
});

test('a cancelled subscription is not treated as Pro', async ({ page }) => {
  await signInAs(page);
  const written: Record<string, unknown>[] = [];
  await mockAppSync(
    page,
    // The waiver requires PRO *and* ACTIVE. A lapsed subscription that kept its
    // tier must still pay.
    handlers({ subscriptionTier: 'PRO', subscriptionStatus: 'CANCELLED' }, written)
  );

  await openResolveTab(page);
  await resolveAsSideA(page);

  await expect
    .poll(() => winningsOf(written), { timeout: 15_000 })
    .toBeDefined();

  expect(winningsOf(written)!.platformFee).toBe(3);
});
