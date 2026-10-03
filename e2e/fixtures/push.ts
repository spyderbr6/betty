import type { Page } from '@playwright/test';

/**
 * Browser push stand-ins. Headless Chromium has no push service, so a real web-push
 * subscription can never be created in these tests; these fakes let the app's decisions
 * around it be exercised instead.
 */

type PromptCountingWindow = Window & { __permissionPrompts: number };

/**
 * Replace the browser's Notification permission with a controllable fake that counts
 * permission dialogs. A dialog answers `answer` ('denied' by default, so no subscription
 * is attempted).
 */
export const fakeNotificationPermission = (
  page: Page,
  initial: NotificationPermission = 'default',
  answer: NotificationPermission = 'denied'
) =>
  page.addInitScript(
    ([start, reply]) => {
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
          permission = reply;
        }
        return permission;
      };
    },
    [initial, answer] as const
  );

/**
 * Stand in for the browser's push service: every subscribe/getSubscription returns the
 * same fake subscription.
 */
export const fakePushSubscription = (page: Page) =>
  page.addInitScript(() => {
    const subscription = {
      endpoint: 'https://push.example.test/sub-e2e',
      toJSON: () => ({ endpoint: 'https://push.example.test/sub-e2e', keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: async () => true,
    };
    PushManager.prototype.getSubscription = async () => subscription as unknown as PushSubscription;
    PushManager.prototype.subscribe = async () => subscription as unknown as PushSubscription;
  });

export const promptCount = (page: Page) =>
  page.evaluate(() => (window as unknown as PromptCountingWindow).__permissionPrompts);
