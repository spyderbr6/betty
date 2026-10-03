import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers } from './fixtures/data';

/**
 * Push registration, sign-out, and the Settings "This Device" section
 * (see PUSH_NOTIFICATION_GUIDE.md §4).
 *
 * Headless Chromium has no push service, so a real web-push subscription can never
 * be created here. These tests cover the decisions around it instead: when the
 * browser permission prompt may be shown, what Settings offers, and which rows
 * sign-out touches.
 */

const INSTALLATION_ID = 'inst-e2e-this-device';

type PromptCountingWindow = Window & { __permissionPrompts: number };

/**
 * Replace the browser's Notification permission with a controllable fake that
 * counts permission dialogs. A dialog answers "denied", so no subscription is attempted.
 */
const fakeNotificationPermission = (page: Page, initial: NotificationPermission = 'default') =>
  page.addInitScript((start) => {
    let permission: NotificationPermission = start;
    const w = window as unknown as PromptCountingWindow;
    w.__permissionPrompts = 0;
    Object.defineProperty(window.Notification, 'permission', {
      configurable: true,
      get: () => permission,
    });
    // Browsers only show a dialog when permission is still 'default'; once decided,
    // requestPermission resolves immediately. Count dialogs, not calls.
    window.Notification.requestPermission = async () => {
      if (permission === 'default') {
        w.__permissionPrompts += 1;
        permission = 'denied';
      }
      return permission;
    };
  }, initial);

/**
 * Stand in for the browser's push service, which headless Chromium does not have: every
 * subscribe/getSubscription returns the same fake subscription.
 */
const fakePushSubscription = (page: Page) =>
  page.addInitScript(() => {
    const subscription = {
      endpoint: 'https://push.example.test/sub-e2e',
      toJSON: () => ({ endpoint: 'https://push.example.test/sub-e2e', keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: async () => true,
    };
    PushManager.prototype.getSubscription = async () => subscription as unknown as PushSubscription;
    PushManager.prototype.subscribe = async () => subscription as unknown as PushSubscription;
  });


const openAccount = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
};

const promptCount = (page: Page) =>
  page.evaluate(() => (window as unknown as PromptCountingWindow).__permissionPrompts);

test('signing in on the web never shows the permission prompt on its own', async ({ page }) => {
  await fakeNotificationPermission(page);
  await signInAs(page);
  const { calls } = await mockAppSync(page, baseHandlers());

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Browsers ignore or penalise prompts without a user gesture.
  expect(await promptCount(page)).toBe(0);
  // No permission, so no subscription and nothing to register.
  expect(calls).not.toContain('registerDevice');
});

test('a browser that already allows notifications registers itself as a device', async ({ page }) => {
  await fakeNotificationPermission(page, 'granted');
  await fakePushSubscription(page);
  await page.addInitScript((id) => window.localStorage.setItem('sidebet.installationId', id), INSTALLATION_ID);
  await signInAs(page);

  const registrations: Record<string, unknown>[] = [];
  await mockAppSync(
    page,
    baseHandlers({
      registerDevice: (variables) => {
        registrations.push(variables);
        return `${TEST_USER.userId}#${INSTALLATION_ID}`;
      },
    })
  );

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });

  await expect.poll(() => registrations.length).toBe(1);
  const [registration] = registrations;
  expect(registration).toMatchObject({
    installationId: INSTALLATION_ID,
    platform: 'WEB',
  });
  // Named from the user agent; Playwright's Desktop Chrome profile reports Windows.
  expect(registration.deviceName).toMatch(/^Chrome on /);
  expect(JSON.parse(registration.token as string).endpoint).toBe('https://push.example.test/sub-e2e');
  expect(typeof registration.timezone).toBe('string');
  // Permission was already granted, so no prompt.
  expect(await promptCount(page)).toBe(0);
});

test('Settings offers to enable this device, and prompts only when tapped', async ({ page }) => {
  await fakeNotificationPermission(page);
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openAccount(page);

  await page.getByTestId('account-settings').dispatchEvent('click');
  await expect(page.getByTestId('settings-device-push-status')).toHaveText(
    'Allow notifications to get alerts on this device'
  );
  // The email switch did nothing and is gone until email exists.
  await expect(page.getByText('Email Notifications')).toHaveCount(0);
  expect(await promptCount(page)).toBe(0);

  await page.getByTestId('settings-enable-device-push').dispatchEvent('click');

  await expect.poll(() => promptCount(page)).toBe(1);
  await expect(page.getByTestId('alert-title')).toHaveText('Notifications Blocked');
  await expect(page.getByTestId('settings-device-push-status')).toContainText('blocked');
  await expect(page.getByTestId('settings-enable-device-push')).toHaveCount(0);
});

test('signing out deactivates this device only, not the user’s other devices', async ({ page }) => {
  await fakeNotificationPermission(page);
  await page.addInitScript((id) => window.localStorage.setItem('sidebet.installationId', id), INSTALLATION_ID);
  await signInAs(page);

  const unregistered: unknown[] = [];
  await mockAppSync(
    page,
    baseHandlers({
      unregisterDevice: (variables) => {
        unregistered.push(variables);
        return true;
      },
    })
  );
  await openAccount(page);

  await page.getByTestId('account-sign-out').dispatchEvent('click');
  await page.getByTestId('account-sign-out-confirm').dispatchEvent('click');

  // The server deactivates this installation's PushDevice row. Identity comes from the
  // caller's token, so only the installation id is sent and no other device can be named.
  await expect.poll(() => unregistered.length).toBe(1);
  expect(unregistered).toEqual([{ installationId: INSTALLATION_ID }]);
});

test.describe('Send test notification', () => {
  const openSettingsWithPushAllowed = async (page: Page, delivered: number) => {
    await fakeNotificationPermission(page, 'granted');
    await fakePushSubscription(page);
    await signInAs(page);
    const tests: unknown[] = [];
    await mockAppSync(
      page,
      baseHandlers({
        registerDevice: () => `${TEST_USER.userId}#${INSTALLATION_ID}`,
        pushDevicesByUser: list([]),
        sendTestPush: (variables) => {
          tests.push(variables);
          return delivered;
        },
      })
    );
    await openAccount(page);
    await page.getByTestId('account-settings').dispatchEvent('click');
    return tests;
  };

  test('sends a test to the caller’s own devices and says how many accepted it', async ({ page }) => {
    const tests = await openSettingsWithPushAllowed(page, 2);

    await page.getByTestId('settings-send-test-push').dispatchEvent('click');

    await expect.poll(() => tests.length).toBe(1);
    // No arguments: the server targets the caller's own devices from their identity.
    expect(tests[0]).toEqual({});
    await expect(page.getByTestId('alert-title')).toHaveText('Test Sent');
    await expect(page.getByTestId('alert-message')).toContainText('Sent to 2 devices');
  });

  test('says so when no device accepted the test', async ({ page }) => {
    await openSettingsWithPushAllowed(page, 0);

    await page.getByTestId('settings-send-test-push').dispatchEvent('click');

    await expect(page.getByTestId('alert-title')).toHaveText('Nothing Delivered');
  });

  test('is not offered until this device allows notifications', async ({ page }) => {
    await fakeNotificationPermission(page, 'default');
    await signInAs(page);
    await mockAppSync(page, baseHandlers());
    await openAccount(page);
    await page.getByTestId('account-settings').dispatchEvent('click');

    await expect(page.getByTestId('settings-enable-device-push')).toBeVisible();
    await expect(page.getByTestId('settings-send-test-push')).toHaveCount(0);
  });
});
