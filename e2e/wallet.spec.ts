import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers, profile } from './fixtures/data';

/**
 * The merged Account screens: Wallet (from the header and from Account), the Account
 * menu, Help & About, and editing the display name.
 */

type Vars = Record<string, unknown>;

const tx = (over: Vars = {}) => ({
  id: 'tx-1',
  userId: TEST_USER.userId,
  type: 'DEPOSIT',
  status: 'COMPLETED',
  amount: 50,
  balanceBefore: 200,
  balanceAfter: 250,
  createdAt: new Date().toISOString(),
  ...over,
});

const PENDING_WIN = tx({ id: 'tx-win', type: 'BET_WON', status: 'PENDING', amount: 20, actualAmount: 19 });

/**
 * transactionsByUser serves two readers: the pending-payout total (filtered) and the
 * Activity list (unfiltered). Answer each as the real index would.
 */
const mockData = async (page: Page, over: Record<string, (v: Vars) => unknown> = {}) => {
  const updates: Vars[] = [];
  await mockAppSync(
    page,
    baseHandlers({
      transactionsByUser: (v) => ({
        items: v.filter ? [PENDING_WIN] : [tx(), PENDING_WIN],
        nextToken: null,
      }),
      listPaymentMethods: () => ({ items: [], nextToken: null }),
      updateUser: (v) => {
        const input = (v as { input: Vars }).input;
        updates.push(input);
        return { ...profile(), ...input };
      },
      ...over,
    })
  );
  return { updates };
};

const boot = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
};

const openAccount = async (page: Page) => {
  await boot(page);
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
};

test('the header balance opens the Wallet from another tab, and Activity from there', async ({ page }) => {
  await signInAs(page);
  await mockData(page);
  await boot(page);

  // Bets tab, not Account: the balance used to do nothing outside a log line
  await page.getByTestId('screen-bets').getByTestId('header-balance').dispatchEvent('click');

  await expect(page.getByTestId('screen-wallet')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('wallet-balance')).toHaveText('$250.00');
  await expect(page.getByTestId('wallet-pending-payouts')).toContainText('$19.00');

  await page.getByTestId('wallet-activity').dispatchEvent('click');
  await expect(page.getByTestId('screen-activity')).toBeVisible({ timeout: 15_000 });
});

test('a bet linked from Activity returns to the tab the Wallet was opened on', async ({ page }) => {
  await signInAs(page);
  const placed = tx({ id: 'tx-bet', type: 'BET_PLACED', amount: 10, relatedBetId: 'bet-1' });
  await mockData(page, {
    transactionsByUser: (v) => ({ items: v.filter ? [] : [placed], nextToken: null }),
  });
  await boot(page);

  // Join tab, so a hard-coded return to Account would show
  await page.getByTestId('tab-live').dispatchEvent('click');
  await expect(page.getByTestId('screen-live')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('screen-live').getByTestId('header-balance').dispatchEvent('click');
  await page.getByTestId('wallet-activity').dispatchEvent('click');
  await page.getByTestId('activity-tx-tx-bet').dispatchEvent('click');

  await expect(page.getByTestId('bet-details-title')).toBeVisible({ timeout: 15_000 });
  // Wallet and Activity closed behind the navigation rather than covering the bet
  await expect(page.getByTestId('screen-wallet')).toHaveCount(0);

  await page.getByTestId('bet-details-back').dispatchEvent('click');
  await expect(page.getByTestId('screen-live')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('screen-account')).toHaveCount(0);
});

test.describe('account wallet card', () => {
  test('shows the balance and pending payouts, and opens the Wallet', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await openAccount(page);

    await expect(page.getByTestId('account-balance')).toHaveText('$250.00');
    await expect(page.getByTestId('account-pending-payouts')).toHaveText('$19.00');

    await page.getByTestId('account-wallet-open').dispatchEvent('click');
    await expect(page.getByTestId('screen-wallet')).toBeVisible({ timeout: 15_000 });
  });

  test('Add funds opens the Wallet straight into adding funds', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await openAccount(page);

    await page.getByTestId('account-add-funds').dispatchEvent('click');
    await expect(page.getByTestId('add-funds-modal')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('withdraw-modal')).toHaveCount(0);
  });

  test('Withdraw opens the Wallet straight into withdrawing', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await openAccount(page);

    await page.getByTestId('account-withdraw').dispatchEvent('click');
    await expect(page.getByTestId('withdraw-modal')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('add-funds-modal')).toHaveCount(0);
  });
});

test('the Account menu has one row per destination', async ({ page }) => {
  await signInAs(page);
  await mockData(page);
  await openAccount(page);

  for (const row of ['account-friends', 'account-wallet', 'account-stats', 'account-settings', 'account-help']) {
    await expect(page.getByTestId(row)).toBeVisible();
  }
  // Merged away: their content lives in Wallet, Settings, and Help & About
  for (const gone of ['account-trust-safety', 'account-payment-methods', 'account-history', 'account-about', 'account-support']) {
    await expect(page.getByTestId(gone)).toHaveCount(0);
  }
});

test('Help & About holds feedback and the legal pages', async ({ page }) => {
  await signInAs(page);
  await mockData(page);
  await openAccount(page);

  await page.getByTestId('account-help').dispatchEvent('click');
  await expect(page.getByTestId('screen-help')).toBeVisible({ timeout: 15_000 });
  for (const id of ['help-feedback', 'help-terms', 'help-privacy', 'help-guidelines', 'help-licenses']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('Settings holds the account and security sections', async ({ page }) => {
  await signInAs(page);
  await mockData(page);
  await openAccount(page);

  await page.getByTestId('account-settings').dispatchEvent('click');
  await expect(page.getByTestId('settings-notifications')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('settings-email')).toHaveText(TEST_USER.email);
  for (const id of ['settings-change-password', 'settings-two-factor', 'settings-phone']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('editing the display name saves it and updates the card', async ({ page }) => {
  await signInAs(page);
  const { updates } = await mockData(page);
  await openAccount(page);

  await page.getByTestId('account-edit-name').dispatchEvent('click');
  await page.getByTestId('profile-editor-name').fill('Renamed Tester');
  await page.getByTestId('profile-editor-save').dispatchEvent('click');

  await expect
    .poll(() => updates.find((u) => u.displayName === 'Renamed Tester'))
    .toMatchObject({ id: TEST_USER.userId, displayNameLower: 'renamed tester' });
  await page.getByTestId('alert-button-ok').dispatchEvent('click');
  await expect(page.getByTestId('account-edit-name')).toContainText('Renamed Tester');
});
