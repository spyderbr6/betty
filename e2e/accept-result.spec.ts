import { expect, test } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, bet } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Accepting a bet's result.
 *
 * A participant can accept the creator's result; when everyone but the creator
 * has, the dispute window closes early and the payout runs sooner. The server's
 * acceptBetResult does the counting and the early close. This phone used to count
 * the acceptances itself and set the bet's disputeWindowEndsAt to the past - a
 * field that decides when money moves - so the test pins that it now sends one
 * request and writes neither the participant nor the bet.
 */

const BET_ID = 'bet-accepting';

const resolvedBet = () =>
  bet({
    id: BET_ID,
    status: 'PENDING_RESOLUTION',
    creatorId: OTHER_USER.id,
    creatorName: OTHER_USER.displayName,
    winningSide: 'A',
    disputeWindowEndsAt: new Date(Date.now() + 47 * 3600_000).toISOString(),
    totalPot: 50,
    betAmount: 25,
    sideACount: 1,
    sideBCount: 1,
    participantUserIds: [OTHER_USER.id, TEST_USER.userId],
  });

const participants = [
  { id: 'participant-them', betId: BET_ID, userId: OTHER_USER.id, side: 'A', amount: 25, status: 'ACCEPTED', hasAcceptedResult: false, joinedAt: new Date().toISOString() },
  { id: 'participant-me', betId: BET_ID, userId: TEST_USER.userId, side: 'B', amount: 25, status: 'DECLINED', hasAcceptedResult: false, joinedAt: new Date().toISOString() },
];

const handlers = (acceptBetResult: () => unknown) =>
  baseHandlers({
    participantsByUser: list([participants[1]]),
    getBet: (variables) => (variables.id === BET_ID ? resolvedBet() : null),
    participantsByBet: list(participants),
    acceptBetResult,
  });

/** Resolved bets live on the Results tab, which loads its own data. */
const openResultsTab = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-resolve').dispatchEvent('click');
  await expect(page.getByTestId('screen-resolve')).toBeVisible({ timeout: 15_000 });
};

test('accepting a result is one request to the server', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(
    page,
    handlers(() => JSON.stringify({ status: 'accepted', closedEarly: true, accepted: 1, total: 1 }))
  );

  await openResultsTab(page);
  await expect(page.getByTestId('bet-accept-result')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('bet-accept-result').dispatchEvent('click');

  await expect(page.getByTestId('alert-title')).toHaveText('Result Accepted', { timeout: 15_000 });
  expect(calls).toContain('acceptBetResult');
  // The acceptance and the early close are the server's to write
  expect(calls).not.toContain('updateParticipant');
  expect(calls).not.toContain('updateBet');
});

test('an acceptance the server refuses is reported, and the button stays', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, handlers(() => JSON.stringify({ status: 'refused', reason: 'NOT_AWAITING' })));

  await openResultsTab(page);
  await expect(page.getByTestId('bet-accept-result')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('bet-accept-result').dispatchEvent('click');

  await expect(page.getByTestId('alert-title')).toHaveText('Error', { timeout: 15_000 });
  await page.getByTestId('alert-button-ok').dispatchEvent('click');
  await expect(page.getByTestId('bet-accept-result')).toBeVisible();
});
