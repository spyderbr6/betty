import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers } from './fixtures/data';
import { fakeNotificationPermission, fakePushSubscription, promptCount } from './fixtures/push';

/**
 * The web side of push (PUSH_NOTIFICATION_GUIDE.md §1 and §6): the soft ask in the feed,
 * and a clicked notification reaching the screen it is about, whether the service worker
 * hands it to an open tab or opens a new one.
 *
 * The service worker itself cannot be driven here (no push service; see fixtures/push.ts),
 * so these tests play its part: posting its messages, or opening the URL it opens.
 */

const deposit = {
  notificationId: 'n-deposit',
  type: 'DEPOSIT_COMPLETED',
  relatedBetId: undefined,
};

const openFeed = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('header-notifications').first().dispatchEvent('click');
};

/** Post a message to the app as the service worker would. */
const fromServiceWorker = (page: Page, message: Record<string, unknown>) =>
  page.evaluate(
    (data) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data })),
    message
  );

test.describe('soft ask', () => {
  test('offers push in the feed, and the browser asks only after "Turn On"', async ({ page }) => {
    await fakeNotificationPermission(page, 'default', 'granted');
    await fakePushSubscription(page);
    await signInAs(page);
    const registrations: unknown[] = [];
    await mockAppSync(
      page,
      baseHandlers({
        registerDevice: (v) => {
          registrations.push(v);
          return `${TEST_USER.userId}#device`;
        },
      })
    );
    await openFeed(page);

    await expect(page.getByTestId('push-soft-ask')).toBeVisible({ timeout: 15_000 });
    expect(await promptCount(page)).toBe(0);

    await page.getByTestId('push-soft-ask-enable').dispatchEvent('click');

    await expect.poll(() => promptCount(page)).toBe(1);
    await expect.poll(() => registrations.length).toBe(1);
    await expect(page.getByTestId('push-soft-ask')).toHaveCount(0);
  });

  test('"Not Now" hides it on this device for good, without asking', async ({ page }) => {
    await fakeNotificationPermission(page);
    await signInAs(page);
    await mockAppSync(page, baseHandlers());
    await openFeed(page);

    await page.getByTestId('push-soft-ask-dismiss').dispatchEvent('click');
    await expect(page.getByTestId('push-soft-ask')).toHaveCount(0);
    expect(await promptCount(page)).toBe(0);

    await openFeed(page);
    await expect(page.getByTestId('notification-screen-empty')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('push-soft-ask')).toHaveCount(0);
  });

  for (const permission of ['granted', 'denied'] as const) {
    test(`is not shown once the browser has an answer (${permission})`, async ({ page }) => {
      await fakeNotificationPermission(page, permission);
      await fakePushSubscription(page);
      await signInAs(page);
      await mockAppSync(page, baseHandlers({ registerDevice: () => `${TEST_USER.userId}#device` }));
      await openFeed(page);

      await expect(page.getByTestId('notification-screen-empty')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('push-soft-ask')).toHaveCount(0);
    });
  }
});

test.describe('notification clicks', () => {
  test('a click handed to an open tab goes to the screen it is about', async ({ page }) => {
    await signInAs(page);
    await mockAppSync(page, baseHandlers());
    await page.goto('/');
    await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

    await fromServiceWorker(page, { type: 'sidebet:notification-click', data: deposit });

    await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
  });

  test('a click that opened a new tab is routed once signed in, and leaves no trace in the URL', async ({ page }) => {
    await signInAs(page);
    await mockAppSync(page, baseHandlers());

    await page.goto(`/?notification=${encodeURIComponent(JSON.stringify(deposit))}`);

    await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).searchParams.has('notification')).toBe(false);
  });

  test('the test notification opens the app without navigating anywhere', async ({ page }) => {
    await signInAs(page);
    await mockAppSync(page, baseHandlers());

    const testPush = { type: 'SYSTEM_ANNOUNCEMENT', test: true };
    await page.goto(`/?notification=${encodeURIComponent(JSON.stringify(testPush))}`);

    await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('screen-account')).toHaveCount(0);
  });
});

test('a renewed browser subscription is registered for this device', async ({ page }) => {
  await fakeNotificationPermission(page, 'granted');
  await fakePushSubscription(page);
  await signInAs(page);
  const registrations: unknown[] = [];
  await mockAppSync(
    page,
    baseHandlers({
      registerDevice: (v) => {
        registrations.push(v);
        return `${TEST_USER.userId}#device`;
      },
    })
  );
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => registrations.length).toBe(1);

  await fromServiceWorker(page, { type: 'sidebet:subscription-changed' });

  // Registered again despite this session having registered already.
  await expect.poll(() => registrations.length).toBe(2);
});
