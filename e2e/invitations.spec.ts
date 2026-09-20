import { expect, test } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, betInvitation, joinableBet } from './fixtures/data';
import { signInAs } from './fixtures/session';

/**
 * Pending bet invitations render on the Bets tab, which is where the app opens,
 * so these need no navigation.
 *
 * The context does not use the invitation record as-is: it enriches each one with
 * a getBet for the bet and a getUser for the sender, and an invitation whose bet
 * lookup returns null never reaches the screen. Both have to be answered or the
 * list silently stays empty.
 */

const withInvitation = (over: Record<string, (v: Record<string, unknown>) => unknown> = {}) =>
  baseHandlers({
    betInvitationsByToUser: list([betInvitation()]),
    getBet: (variables) => (variables.id === 'bet-open' ? joinableBet() : null),
    updateBetInvitation: (variables) => ({ ...variables, status: 'DECLINED' }),
    createNotification: (variables) => ({ id: 'notification-1', ...variables }),
    ...over,
  });

test('a pending invitation is listed with its sender and bet', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, withInvitation());

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

  const card = page.getByTestId('invitation-card-inv-1');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('Lakers win outright');
  await expect(card).toContainText(OTHER_USER.displayName);
});

test('declining an invitation takes it off the list', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, withInvitation());

  await page.goto('/');
  await expect(page.getByTestId('invitation-card-inv-1')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('invitation-decline').dispatchEvent('click');

  await expect(page.getByTestId('invitation-card-inv-1')).toBeHidden({ timeout: 15_000 });
  // Removed because the server was told, not just because local state dropped it.
  expect(calls).toContain('updateBetInvitation');
});
