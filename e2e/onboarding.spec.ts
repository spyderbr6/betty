import { expect, test } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers } from './fixtures/data';
import { PNG_1X1, mockS3 } from './fixtures/storage';

/**
 * A brand-new user, end to end: the User record is created at sign-in, onboarding runs
 * against it, and the profile picture uploads on web.
 */

type Vars = Record<string, unknown>;

test('a new user is created, onboards with a photo, and lands in the app', async ({ page }) => {
  await signInAs(page);
  const s3 = await mockS3(page);

  let record: Vars | null = null;
  // Every write in order, so the test can show the create came before onboarding's writes
  const writes: { op: 'create' | 'update'; input: Vars }[] = [];
  const { calls } = await mockAppSync(
    page,
    baseHandlers({
      getUser: () => record,
      // The server creates the record (ensureMyUserRecord), with the money and role
      // fields its own; the phone sends only display details. This stands in for it.
      ensureMyUserRecord: (v) => {
        writes.push({ op: 'create', input: v });
        record = {
          id: TEST_USER.userId,
          username: TEST_USER.userId,
          email: v.email,
          displayName: v.displayName,
          balance: 0,
          role: 'USER',
          onboardingCompleted: false,
          onboardingStep: 0,
        };
        return JSON.stringify({ status: 'created' });
      },
      updateUser: (v) => {
        const input = (v as { input: Vars }).input;
        writes.push({ op: 'update', input });
        // A write against a missing record fails, as the real API's condition does
        if (!record) return null;
        record = { ...record, ...input };
        return record;
      },
      createNotificationPreferences: (v) => ({ id: 'prefs-new', ...(v as { input: Vars }).input }),
    })
  );

  await page.goto('/');

  // Onboarding opens over the app for the new account
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 1 of 3', { timeout: 30_000 });
  expect(writes[0]?.op).toBe('create');
  // The record is the server's to create: the phone never sends createUser
  expect(calls).not.toContain('createUser');

  // Step 1: choose a photo. The picker is a file input on web.
  const chooser = page.waitForEvent('filechooser', { timeout: 15_000 });
  await page.getByTestId('onboarding-choose-photo').click();
  await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1 });

  await expect
    .poll(() => writes.find((w) => w.op === 'update' && 'profilePictureUrl' in w.input)?.input.profilePictureUrl, {
      timeout: 15_000,
    })
    .toMatch(new RegExp(`^profile-pictures/${TEST_USER.userId}/avatar-\\d+\\.jpg$`));
  expect(s3.calls.some((c) => c.method === 'PUT' && c.key.includes(`profile-pictures/${TEST_USER.userId}/`))).toBe(true);

  await page.getByTestId('onboarding-next-picture').dispatchEvent('click');
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 2 of 3');
  await page.getByTestId('onboarding-skip-funds').dispatchEvent('click');
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 3');
  await page.getByTestId('onboarding-skip-friends').dispatchEvent('click');

  await page.getByTestId('alert-button-get-started').dispatchEvent('click');
  await expect(page.getByTestId('onboarding-step')).toHaveCount(0);
  await expect(page.getByTestId('screen-bets')).toBeVisible();

  // Exactly one create, first; every onboarding write landed on the record it made
  expect(writes.filter((w) => w.op === 'create')).toHaveLength(1);
  expect(writes[0].op).toBe('create');
  expect(record).toMatchObject({ onboardingCompleted: true, onboardingStep: 3 });
});
