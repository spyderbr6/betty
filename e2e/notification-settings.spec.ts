import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers } from './fixtures/data';

/**
 * Push registration and the Settings "This Device" row (Phase 0 of
 * docs/NOTIFICATIONS_PLAN.md).
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
 * counts prompts. The prompt answers "denied", so no subscription is attempted.
 */
const fakeNotificationPermission = (page: Page) =>
  page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    const w = window as unknown as PromptCountingWindow;
    w.__permissionPrompts = 0;
    Object.defineProperty(window.Notification, 'permission', {
      configurable: true,
      get: () => permission,
    });
    window.Notification.requestPermission = async () => {
      w.__permissionPrompts += 1;
      permission = 'denied';
      return permission;
    };
  });

const preferences = {
  id: 'prefs-1',
  userId: TEST_USER.userId,
  pushEnabled: true,
  inAppEnabled: true,
  emailEnabled: false,
  friendRequestsEnabled: true,
  betInvitationsEnabled: true,
  betJoinedEnabled: true,
  betResolvedEnabled: true,
  betCancelledEnabled: true,
  betDeadlineEnabled: true,
  paymentNotificationsEnabled: true,
  systemAnnouncementsEnabled: true,
  dndEnabled: false,
};

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
  expect(calls).not.toContain('createPushToken');
});

test('Settings offers to enable this device, and prompts only when tapped', async ({ page }) => {
  await fakeNotificationPermission(page);
  await signInAs(page);
  await mockAppSync(page, baseHandlers({ notificationPreferencesByUser: list([preferences]) }));
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

  const deactivated: unknown[] = [];
  await mockAppSync(
    page,
    baseHandlers({
      pushTokensByUser: list([
        { id: 'this-device', userId: TEST_USER.userId, token: 'sub-this', deviceId: INSTALLATION_ID, isActive: true },
        { id: 'other-device', userId: TEST_USER.userId, token: 'sub-other', deviceId: 'inst-phone', isActive: true },
      ]),
      updatePushToken: (variables) => {
        const input = (variables as { input: { id: string } }).input;
        deactivated.push(input);
        return input;
      },
    })
  );
  await openAccount(page);

  await page.getByTestId('account-sign-out').dispatchEvent('click');
  await page.getByTestId('account-sign-out-confirm').dispatchEvent('click');

  await expect.poll(() => deactivated.length).toBe(1);
  expect(deactivated).toEqual([{ id: 'this-device', isActive: false }]);
});
