import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers } from './fixtures/data';

/**
 * Requesting a withdrawal.
 *
 * One request: the server's requestWithdrawal checks the Venmo account is the
 * user's, the amount and the balance, computes the fee, and takes the amount now
 * as a pending withdrawal an admin then sends or rejects. The phone used to only
 * check the balance, so several requests could add up to more than it.
 *
 * Any active Venmo account can receive a withdrawal (the admin checks the handle
 * when approving); the modal used to offer only verified ones, and nothing in the
 * app verifies an account any more. The fee the confirmation shows is the one the
 * server charges: it used to show no fee while 2% was recorded.
 */

type Vars = Record<string, unknown>;

const venmo = {
  id: 'pm-1',
  userId: TEST_USER.userId,
  type: 'VENMO',
  venmoUsername: 'pat-venmo',
  displayName: 'My Venmo',
  isVerified: false,
  isActive: true,
  isDefault: true,
  createdAt: new Date().toISOString(),
};

/** The writes the phone used to make; none may happen now. */
const CLIENT_WRITES = ['createTransaction', 'updateUser'];

const mock = async (page: Page, me: Vars, requestWithdrawal: (v: Vars) => unknown) =>
  mockAppSync(
    page,
    baseHandlers(
      {
        listPaymentMethods: () => ({ items: [venmo], nextToken: null }),
        transactionsByUser: () => ({ items: [], nextToken: null }),
        updatePaymentMethod: (v) => ({ ...venmo, ...((v as { input: Vars }).input ?? {}) }),
        requestWithdrawal,
      },
      me
    )
  );

/** Account tab -> Withdraw -> the (unverified) Venmo account -> $50 -> confirmation. */
const toConfirmation = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('account-withdraw').dispatchEvent('click');
  await expect(page.getByTestId('withdraw-modal')).toBeVisible({ timeout: 15_000 });

  // Unverified, and offered anyway
  await page.getByTestId('withdraw-method-pm-1').dispatchEvent('click');
  await page.getByTestId('withdraw-continue').dispatchEvent('click');
  await page.getByTestId('withdraw-amount').fill('50');
  await page.getByTestId('withdraw-continue').dispatchEvent('click');
  await expect(page.getByTestId('withdraw-receive')).toBeVisible({ timeout: 15_000 });
};

test('a withdrawal shows the fee it will be charged and sends one request', async ({ page }) => {
  await signInAs(page);
  const sent: Vars[] = [];
  const { calls } = await mock(page, { balance: 250 }, (v) => {
    sent.push(v);
    return JSON.stringify({ status: 'requested', transactionId: `withdrawal#${v.requestId}`, amount: 50, fee: 1, net: 49, balance: 200 });
  });

  await toConfirmation(page);
  // 2% of $50, the same function the server charges with
  await expect(page.getByTestId('withdraw-fee')).toHaveText('-$1.00');
  await expect(page.getByTestId('withdraw-receive')).toHaveText('$49.00');

  await page.getByTestId('withdraw-submit').dispatchEvent('click');
  await expect(page.getByTestId('alert-title')).toHaveText('Withdrawal Pending', { timeout: 15_000 });

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ amount: 50, paymentMethodId: 'pm-1' });
  expect(sent[0].requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const write of CLIENT_WRITES) expect(calls).not.toContain(write);
});

test('Pro members are shown no fee', async ({ page }) => {
  await signInAs(page);
  await mock(page, { balance: 250, subscriptionTier: 'PRO', subscriptionStatus: 'ACTIVE' }, () =>
    JSON.stringify({ status: 'requested', transactionId: 'withdrawal#x', amount: 50, fee: 0, net: 50, balance: 200 })
  );

  await toConfirmation(page);
  await expect(page.getByTestId('withdraw-fee')).toHaveCount(0);
  await expect(page.getByTestId('withdraw-receive')).toHaveText('$50.00');
});

test('a withdrawal the server refuses explains why', async ({ page }) => {
  await signInAs(page);
  await mock(page, { balance: 250 }, () =>
    JSON.stringify({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 12.5, required: 50 })
  );

  await toConfirmation(page);
  await page.getByTestId('withdraw-submit').dispatchEvent('click');
  await expect(page.getByTestId('alert-title')).toHaveText('Insufficient Balance', { timeout: 15_000 });
  await expect(page.getByTestId('alert-message')).toContainText('$12.50');
});
