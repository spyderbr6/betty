import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers } from './fixtures/data';

/**
 * The Account tab as a stack, notification taps that land inside it, and Pro membership on
 * the profile and in the Wallet.
 */

type Vars = Record<string, unknown>;

const PRO = { subscriptionTier: 'PRO', subscriptionStatus: 'ACTIVE' };
const PAST_DUE = { subscriptionTier: 'FREE', subscriptionStatus: 'PAST_DUE' };

const fee = (over: Vars = {}) => ({
  id: 'tx-fee',
  userId: TEST_USER.userId,
  type: 'WITHDRAWAL',
  status: 'COMPLETED',
  amount: 100,
  platformFee: 2,
  balanceBefore: 350,
  balanceAfter: 250,
  createdAt: new Date().toISOString(),
  ...over,
});

const mockData = async (page: Page, me: Vars = {}, over: Record<string, (v: Vars) => unknown> = {}) =>
  mockAppSync(
    page,
    baseHandlers(
      {
        transactionsByUser: () => ({ items: [], nextToken: null }),
        listPaymentMethods: list(),
        ...over,
      },
      me
    )
  );

const openAccount = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
};

/** Post a message to the app as the service worker would (see web-push.spec). */
const fromServiceWorker = (page: Page, message: Record<string, unknown>) =>
  page.evaluate(
    (data) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data })),
    message
  );

test.describe('account stack', () => {
  test('Friends is a page with a back arrow that returns to Account', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await openAccount(page);

    await page.getByTestId('account-friends').dispatchEvent('click');
    await expect(page.getByTestId('screen-friends')).toBeVisible({ timeout: 15_000 });
    // A page, not a modal: back arrow rather than a close button
    await expect(page.getByTestId('screen-friends').getByTestId('modal-close')).toHaveCount(0);

    await page.getByTestId('screen-friends').getByTestId('header-back').dispatchEvent('click');
    await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('screen-friends')).toHaveCount(0);
  });

  test('Settings, Wallet and Help & About are pages too', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await openAccount(page);

    for (const [row, screen] of [
      ['account-settings', 'settings-notifications'],
      ['account-wallet', 'screen-wallet'],
      ['account-help', 'screen-help'],
    ]) {
      await page.getByTestId(row).dispatchEvent('click');
      await expect(page.getByTestId(screen)).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('header-back').last().dispatchEvent('click');
      await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
    }
  });
});

test.describe('notification taps into the Account stack', () => {
  test('a friend request push opens Friends with the requests list, over Account', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await page.goto('/');
    await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

    await fromServiceWorker(page, {
      type: 'sidebet:notification-click',
      data: { notificationId: 'n-fr', type: 'FRIEND_REQUEST_RECEIVED', relatedUserId: 'other' },
    });

    // Used to land on Account and rely on a param the screen read once
    await expect(page.getByTestId('friend-requests-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('friend-requests-modal').getByTestId('modal-close').dispatchEvent('click');
    await expect(page.getByTestId('screen-friends')).toBeVisible();

    // The Account tab had never been opened; back still has its home page to go to
    await page.getByTestId('screen-friends').getByTestId('header-back').dispatchEvent('click');
    await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
  });

  test('coming back to the Account tab later does not replay the notification', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await page.goto('/');
    await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

    await fromServiceWorker(page, {
      type: 'sidebet:notification-click',
      data: { notificationId: 'n-fr', type: 'FRIEND_REQUEST_RECEIVED', relatedUserId: 'other' },
    });
    await expect(page.getByTestId('friend-requests-modal')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('friend-requests-modal').getByTestId('modal-close').dispatchEvent('click');
    await page.getByTestId('screen-friends').getByTestId('header-back').dispatchEvent('click');
    await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });

    // Leave the tab and come back through the tab bar
    await page.getByTestId('tab-bets').dispatchEvent('click');
    await expect(page.getByTestId('screen-bets')).toBeVisible();
    await page.getByTestId('tab-account').dispatchEvent('click');

    await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId('screen-friends')).toHaveCount(0);
    await expect(page.getByTestId('friend-requests-modal')).toHaveCount(0);
  });

  test('an accepted friend request push opens Friends', async ({ page }) => {
    await signInAs(page);
    await mockData(page);
    await page.goto('/');
    await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

    // Navigated to 'Friends' from the root before, which only knows tabs: nothing happened
    await fromServiceWorker(page, {
      type: 'sidebet:notification-click',
      data: { notificationId: 'n-fa', type: 'FRIEND_REQUEST_ACCEPTED', relatedUserId: 'other' },
    });

    await expect(page.getByTestId('screen-friends')).toBeVisible({ timeout: 15_000 });
  });

  test('a friend request tapped in the feed opens Friends with the requests list', async ({ page }) => {
    await signInAs(page);
    await mockData(page, {}, {
      notificationsByUser: list([
        {
          id: 'fr',
          userId: TEST_USER.userId,
          type: 'FRIEND_REQUEST_RECEIVED',
          category: 'FRIENDS',
          title: 'New friend request',
          message: 'Casey wants to be friends',
          isRead: false,
          priority: 'MEDIUM',
          relatedUserId: 'other',
          createdAt: new Date().toISOString(),
        },
      ]),
    });
    await page.goto('/');
    await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('header-notifications').first().dispatchEvent('click');
    await page.getByTestId('notification-item-fr').dispatchEvent('click');

    // The feed's own router logged "Unknown modal" for this and stayed put
    await expect(page.getByTestId('friend-requests-modal')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('pro membership', () => {
  test('a Pro member gets a ringed avatar and a PRO chip that opens their membership', async ({ page }) => {
    await signInAs(page);
    await mockData(page, PRO);
    await openAccount(page);

    await expect(page.getByTestId('account-membership-pro')).toContainText('PRO');
    await expect(page.getByTestId('account-membership-upgrade')).toHaveCount(0);

    await page.getByTestId('account-membership-pro').dispatchEvent('click');
    await expect(page.getByTestId('screen-subscription')).toBeVisible({ timeout: 15_000 });
  });

  test('a cancelled member with the PRO tier still set is not shown as Pro', async ({ page }) => {
    // The old menu row checked the tier alone and said "Pro Membership · 0% fees" here
    await signInAs(page);
    await mockData(page, { subscriptionTier: 'PRO', subscriptionStatus: 'CANCELLED' });
    await openAccount(page);

    await expect(page.getByTestId('account-membership-upgrade')).toBeVisible();
    await expect(page.getByTestId('account-membership-pro')).toHaveCount(0);
  });

  test('a failed Pro payment is called out on the profile and in the Wallet', async ({ page }) => {
    await signInAs(page);
    await mockData(page, PAST_DUE);
    await openAccount(page);

    await expect(page.getByTestId('account-membership-issue')).toBeVisible();
    await page.getByTestId('account-wallet').dispatchEvent('click');
    await expect(page.getByTestId('wallet-pro-payment_issue')).toContainText('payment failed');
  });

  test('the Wallet shows a free member the fees Pro would have saved', async ({ page }) => {
    await signInAs(page);
    await mockData(page, {}, {
      transactionsByUser: (v) => ({
        // Pending payouts use a filter; the fee total reads the last 30 days by key
        items: v.filter ? [] : [fee(), fee({ id: 'tx-win', type: 'BET_WON', platformFee: 1.5 })],
        nextToken: null,
      }),
    });
    await openAccount(page);

    await page.getByTestId('account-wallet').dispatchEvent('click');
    await expect(page.getByTestId('wallet-pro-free')).toContainText('$3.50');
    await page.getByTestId('wallet-pro-free').dispatchEvent('click');
    await expect(page.getByTestId('screen-subscription')).toBeVisible({ timeout: 15_000 });
  });

  test('the Wallet tells a Pro member their fees are waived', async ({ page }) => {
    await signInAs(page);
    await mockData(page, PRO);
    await openAccount(page);

    await page.getByTestId('account-wallet').dispatchEvent('click');
    await expect(page.getByTestId('wallet-pro-pro')).toContainText('no fees');
  });
});
