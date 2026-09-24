import { expect, test } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, betInvitation, joinableBet } from './fixtures/data';
import { signInAs } from './fixtures/session';

/**
 * Pending bet invitations render on the **Join** tab, not the Bets tab where the
 * app opens, so these navigate first. They moved because accepting an invitation
 * is a join: the tab that announces one is now the tab that clears it.
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

/** Open the app and cross to the Join tab, where invitations now live. */
const openJoinTab = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-live').dispatchEvent('click');
  await expect(page.getByTestId('screen-live')).toBeVisible({ timeout: 15_000 });
};

test('a pending invitation is listed with its sender and bet', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, withInvitation());

  await openJoinTab(page);

  const card = page.getByTestId('invitation-card-inv-1');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText('Lakers win outright');
  await expect(card).toContainText(OTHER_USER.displayName);
});

test('declining an invitation takes it off the list', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, withInvitation());

  await openJoinTab(page);
  await expect(page.getByTestId('invitation-card-inv-1')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('invitation-decline').dispatchEvent('click');

  await expect(page.getByTestId('invitation-card-inv-1')).toBeHidden({ timeout: 15_000 });
  // Removed because the server was told, not just because local state dropped it.
  expect(calls).toContain('updateBetInvitation');
});

test('the Bets tab points at Join rather than hiding the invitation', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, withInvitation());

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

  // Moving invitations off this screen must not make them invisible from it.
  const pointer = page.getByTestId('bets-pending-pointer');
  await expect(pointer).toBeVisible({ timeout: 15_000 });
  await expect(pointer).toContainText('1 pending invitation');

  await pointer.dispatchEvent('click');
  await expect(page.getByTestId('screen-live')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('invitation-card-inv-1')).toBeVisible({ timeout: 15_000 });
});

test('with nothing pending the Bets tab shows no pointer', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

  // Guards the inverse: the pointer is a request indicator, not decoration.
  await expect(page.getByTestId('bets-pending-pointer')).toBeHidden();
});

test('the Bets tab shows a dot while an invitation is pending', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, withInvitation());

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

  // The dot is the only signal on this tab: its old count was the viewer's own
  // open bets, which never reached zero and so never meant anything.
  await expect(page.getByTestId('tab-bets-pending-dot')).toBeVisible({ timeout: 15_000 });
});

test('the Bets tab has no dot when nothing is pending', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

  await expect(page.getByTestId('tab-bets-pending-dot')).toHaveCount(0);
});
