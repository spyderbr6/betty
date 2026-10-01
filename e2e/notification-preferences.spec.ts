import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers, notificationPreferences } from './fixtures/data';

/**
 * Notification preferences (Phase 2 of docs/NOTIFICATIONS_PLAN.md): per-category alerts
 * and feed visibility, quiet hours, the device list, and the feed honouring all of it.
 */

const INSTALLATION_ID = 'inst-e2e-this-device';

const prefsRow = notificationPreferences;

type Saved = Record<string, unknown>;

/** Mock the data layer, recording every preferences save and device mutation. */
const mockData = async (page: Page, over: Record<string, (v: Record<string, unknown>) => unknown> = {}) => {
  const saves: Saved[] = [];
  const devicePush: Saved[] = [];
  const deletes: Saved[] = [];
  await mockAppSync(
    page,
    baseHandlers({
      notificationPreferencesByUser: list([prefsRow()]),
      updateNotificationPreferences: (v) => {
        const input = (v as { input: Saved }).input;
        saves.push(input);
        return { ...prefsRow(), ...input };
      },
      pushDevicesByUser: list([]),
      setDevicePush: (v) => {
        devicePush.push(v);
        return true;
      },
      deletePushDevice: (v) => {
        deletes.push((v as { input: Saved }).input);
        return (v as { input: Saved }).input;
      },
      ...over,
    })
  );
  return { saves, devicePush, deletes };
};

const openSettings = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('account-settings').dispatchEvent('click');
  await expect(page.getByTestId('settings-notifications')).toBeVisible({ timeout: 15_000 });
};

/** React Native Web renders Switch as a checkbox input inside the testID'd element. */
const toggle = (page: Page, testID: string) => page.getByTestId(testID).locator('input').click();
const switchState = (page: Page, testID: string) => page.getByTestId(testID).locator('input');

test.describe('categories', () => {
  test('muting a category’s alerts saves it without touching its feed setting', async ({ page }) => {
    await signInAs(page);
    const { saves } = await mockData(page);
    await openSettings(page);

    await expect(switchState(page, 'settings-category-FRIENDS-alerts')).toBeChecked();
    await toggle(page, 'settings-category-FRIENDS-alerts');

    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]).toMatchObject({ alertMutedCategories: ['FRIENDS'], feedMutedCategories: [] });
    await expect(switchState(page, 'settings-category-FRIENDS-alerts')).not.toBeChecked();
  });

  test('every category’s alerts can be muted, but money, results, refunds and disputes stay in the feed', async ({ page }) => {
    await signInAs(page);
    const { saves } = await mockData(page);
    await openSettings(page);

    for (const locked of ['MONEY', 'RESULTS', 'REFUNDS', 'ACTION_NEEDED']) {
      await expect(page.getByTestId(`settings-category-${locked}-feed-locked`)).toBeVisible();
      await expect(page.getByTestId(`settings-category-${locked}-feed`)).toHaveCount(0);
      await expect(page.getByTestId(`settings-category-${locked}-alerts`)).toBeVisible();
    }
    await expect(page.getByTestId('settings-category-REMINDERS-feed')).toBeVisible();

    await toggle(page, 'settings-category-MONEY-alerts');
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]).toMatchObject({ alertMutedCategories: ['MONEY'] });
  });

  test('hiding a category from the feed saves a feed mute', async ({ page }) => {
    await signInAs(page);
    const { saves } = await mockData(page);
    await openSettings(page);

    await toggle(page, 'settings-category-REMINDERS-feed');
    await expect.poll(() => saves.length).toBe(1);
    expect(saves[0]).toMatchObject({ alertMutedCategories: [], feedMutedCategories: ['REMINDERS'] });
  });

  test('choices made with the old per-type switches carry over', async ({ page }) => {
    await signInAs(page);
    await mockData(page, {
      // A pre-Phase-2 row: no category lists, friend requests switched off.
      notificationPreferencesByUser: list([
        prefsRow({ alertMutedCategories: null, feedMutedCategories: null, friendRequestsEnabled: false }),
      ]),
    });
    await openSettings(page);

    await expect(switchState(page, 'settings-category-FRIENDS-alerts')).not.toBeChecked();
    await expect(switchState(page, 'settings-category-FRIENDS-feed')).not.toBeChecked();
    await expect(switchState(page, 'settings-category-INVITATIONS-alerts')).toBeChecked();
  });
});

test('quiet hours default to 10 PM–7 AM, step by 30 minutes, and show the timezone', async ({ page }) => {
  await signInAs(page);
  const { saves } = await mockData(page);
  await openSettings(page);

  await expect(page.getByTestId('settings-quiet-start-value')).toHaveCount(0);
  await toggle(page, 'settings-quiet-enabled');

  await expect(page.getByTestId('settings-quiet-start-value')).toHaveText('10:00 PM');
  await expect(page.getByTestId('settings-quiet-end-value')).toHaveText('7:00 AM');
  await expect(page.getByTestId('settings-quiet-timezone')).toContainText('America/New_York');

  await page.getByTestId('settings-quiet-start-later').dispatchEvent('click');
  await page.getByTestId('settings-quiet-end-earlier').dispatchEvent('click');
  await expect(page.getByTestId('settings-quiet-start-value')).toHaveText('10:30 PM');
  await expect(page.getByTestId('settings-quiet-end-value')).toHaveText('6:30 AM');

  await expect.poll(() => saves.length).toBe(3);
  expect(saves[2]).toMatchObject({ dndEnabled: true, quietStartMinute: 22 * 60 + 30, quietEndMinute: 6 * 60 + 30 });
});

test('the device list switches push per device and removes devices', async ({ page }) => {
  await page.addInitScript((id) => window.localStorage.setItem('sidebet.installationId', id), INSTALLATION_ID);
  await signInAs(page);
  const device = (installationId: string, deviceName: string, over: Record<string, unknown> = {}) => ({
    id: `${TEST_USER.userId}#${installationId}`,
    userId: TEST_USER.userId,
    installationId,
    platform: 'WEB',
    deviceName,
    pushEnabled: true,
    isActive: true,
    lastSeenAt: new Date().toISOString(),
    ...over,
  });
  const { devicePush, deletes } = await mockData(page, {
    pushDevicesByUser: list([
      device(INSTALLATION_ID, 'Chrome on Windows'),
      device('inst-phone-0001', 'Google Pixel 8', { platform: 'ANDROID' }),
    ]),
  });
  await openSettings(page);

  const phone = page.getByTestId('settings-device-inst-phone-0001');
  await expect(phone).toContainText('Google Pixel 8');
  await expect(phone).toContainText('Active today');
  await expect(page.getByTestId(`settings-device-${INSTALLATION_ID}`)).toContainText('THIS DEVICE');
  // This device's own switch is also offered at the top.
  await expect(page.getByTestId('settings-this-device-push')).toBeVisible();

  await toggle(page, 'settings-device-inst-phone-0001-push');
  await expect.poll(() => devicePush.length).toBe(1);
  expect(devicePush[0]).toEqual({ deviceId: `${TEST_USER.userId}#inst-phone-0001`, pushEnabled: false });

  await page.getByTestId('settings-device-inst-phone-0001-remove').dispatchEvent('click');
  await expect(page.getByTestId('alert-title')).toHaveText('Remove Device');
  await page.getByTestId('alert-button-remove').dispatchEvent('click');
  await expect.poll(() => deletes.length).toBe(1);
  expect(deletes[0]).toEqual({ id: `${TEST_USER.userId}#inst-phone-0001` });
  await expect(phone).toHaveCount(0);
});

test('the feed hides muted categories but always shows money, results, refunds and disputes', async ({ page }) => {
  await signInAs(page);
  const note = (id: string, type: string, category: string | null) => ({
    id,
    userId: TEST_USER.userId,
    type,
    category,
    title: `title-${id}`,
    message: `message-${id}`,
    isRead: false,
    priority: 'MEDIUM',
    createdAt: new Date().toISOString(),
  });
  await mockData(page, {
    notificationPreferencesByUser: list([prefsRow({ feedMutedCategories: ['FRIENDS', 'REMINDERS', 'MONEY'] })]),
    notificationsByUser: list([
      note('friend', 'FRIEND_REQUEST_RECEIVED', 'FRIENDS'),
      // Written before categories existed: the category comes from the type.
      note('friend-old', 'FRIEND_REQUEST_ACCEPTED', null),
      note('reminder', 'BET_DEADLINE_APPROACHING', 'REMINDERS'),
      note('deposit', 'DEPOSIT_COMPLETED', 'MONEY'),
      note('joined', 'BET_JOINED', 'MY_BET_ACTIVITY'),
    ]),
  });

  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  // Unread counts only what the feed shows: the deposit (locked) and the join.
  await expect(page.getByTestId('header-notifications-count').first()).toHaveText('2');

  await page.getByTestId('header-notifications').first().dispatchEvent('click');
  await expect(page.getByTestId('notification-item-deposit')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('notification-item-joined')).toBeVisible();
  await expect(page.getByTestId('notification-item-friend')).toHaveCount(0);
  await expect(page.getByTestId('notification-item-friend-old')).toHaveCount(0);
  await expect(page.getByTestId('notification-item-reminder')).toHaveCount(0);
});
