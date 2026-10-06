import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { baseHandlers } from './fixtures/data';
import { signInAs } from './fixtures/session';

/**
 * An admin approving or rejecting a pending withdrawal.
 *
 * One request: the server's adminDecideTransaction checks the account is in the
 * Cognito admins group and moves the money and the status together while the row
 * is still pending. The admin's phone used to write the balance itself, and
 * "admin" was a role field users could set on their own record.
 */

const WITHDRAWAL = {
  id: 'withdrawal#6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  userId: 'user-withdrawing',
  type: 'WITHDRAWAL',
  status: 'PENDING',
  amount: 50,
  actualAmount: 49,
  platformFee: 1,
  balanceBefore: 250,
  balanceAfter: 200,
  venmoUsername: 'pat-venmo',
  paymentMethodId: 'pm-1',
  createdAt: new Date().toISOString(),
};

/** The writes the admin's phone used to make; none may happen now. */
const CLIENT_WRITES = ['updateTransaction', 'updateUser', 'createTrustScoreHistory'];

const mock = async (page: Page, adminDecideTransaction: (v: Record<string, unknown>) => unknown) =>
  mockAppSync(
    page,
    baseHandlers(
      {
        transactionsByStatus: (v) => ({ items: v.status === 'PENDING' ? [WITHDRAWAL] : [], nextToken: null }),
        adminDecideTransaction,
      },
      // The dashboard only opens for an admin
      { role: 'ADMIN' }
    )
  );

const openDashboard = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
  const adminEntry = page.getByTestId('account-admin-dashboard');
  await expect(adminEntry).toBeVisible({ timeout: 15_000 });
  await adminEntry.dispatchEvent('click');
  await expect(page.getByTestId('screen-admin')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`admin-approve-${WITHDRAWAL.id}`)).toBeVisible({ timeout: 15_000 });
};

const approve = async (page: Page) => {
  await page.getByTestId(`admin-approve-${WITHDRAWAL.id}`).dispatchEvent('click');
  // The last four characters of the transaction id, as the admin reads them off the card
  await page.getByTestId('admin-approval-code').fill(WITHDRAWAL.id.slice(-4));
  await page.getByTestId('admin-approval-confirm').dispatchEvent('click');
};

test('approving a withdrawal is one request, and the phone moves no money', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  const { calls } = await mock(page, (v) => {
    sent.push(v);
    return JSON.stringify({ status: 'decided', outcome: 'COMPLETED', userId: WITHDRAWAL.userId, credited: 0 });
  });

  await openDashboard(page);
  await approve(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Success', { timeout: 15_000 });
  // No amount received for a withdrawal: that only applies to a deposit
  expect(sent).toEqual([{ transactionId: WITHDRAWAL.id, approve: true }]);
  for (const write of CLIENT_WRITES) expect(calls).not.toContain(write);
});

test('rejecting sends the reason', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  await mock(page, (v) => {
    sent.push(v);
    return JSON.stringify({ status: 'decided', outcome: 'FAILED', userId: WITHDRAWAL.userId, credited: 50 });
  });

  await openDashboard(page);
  await page.getByTestId(`admin-reject-${WITHDRAWAL.id}`).dispatchEvent('click');
  await page.getByTestId('admin-reject-reason').fill('Venmo handle not found');
  await page.getByTestId('admin-reject-confirm').dispatchEvent('click');

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
  expect(sent[0]).toEqual({ transactionId: WITHDRAWAL.id, approve: false, reason: 'Venmo handle not found' });
});

test('an account outside the admins group is told why it cannot decide', async ({ page }) => {
  await signInAs(page);
  await mock(page, () => JSON.stringify({ status: 'refused', reason: 'NOT_ADMIN' }));

  await openDashboard(page);
  await approve(page);

  await expect(page.getByTestId('alert-message')).toContainText('admins group', { timeout: 15_000 });
});
