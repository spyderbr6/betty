import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers, profile } from './fixtures/data';
import { PNG_1X1, mockS3 } from './fixtures/storage';

/**
 * The Account tab: how it loads, and what Trust & Safety writes when it opens.
 */

type Vars = Record<string, unknown>;

const PHONE = '+15555550123';

const openAccount = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-account').dispatchEvent('click');
  await expect(page.getByTestId('screen-account')).toBeVisible({ timeout: 15_000 });
};

/**
 * Give the signed-in user a verified phone in Cognito. Registered after signInAs, so
 * it runs first; everything but GetUser falls through to the session fixture.
 */
const withCognitoPhone = async (page: Page) => {
  await page.route('**/cognito-idp.*.amazonaws.com/**', async (route) => {
    const action = (route.request().headers()['x-amz-target'] ?? '').split('.').pop();
    if (action !== 'GetUser') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/x-amz-json-1.1',
      body: JSON.stringify({
        Username: TEST_USER.username,
        UserAttributes: [
          { Name: 'sub', Value: TEST_USER.userId },
          { Name: 'email', Value: TEST_USER.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'phone_number', Value: PHONE },
          { Name: 'phone_number_verified', Value: 'true' },
        ],
      }),
    });
  });
};

test('pending payouts are read through the user index, across every page', async ({ page }) => {
  await signInAs(page);
  const pages: Vars[] = [];
  const { calls } = await mockAppSync(
    page,
    baseHandlers({
      // A filtered index query can return an empty page with more to come; the
      // matching row is deliberately on the second page.
      transactionsByUser: (v) => {
        pages.push(v);
        return v.nextToken
          ? {
              items: [{ id: 'tx-1', userId: TEST_USER.userId, type: 'BET_WON', status: 'PENDING', amount: 40, actualAmount: 38.5 }],
              nextToken: null,
            }
          : { items: [], nextToken: 'page-2' };
      },
    })
  );

  await openAccount(page);

  await expect(page.getByTestId('account-pending-payouts')).toHaveText('$38.50');
  expect(pages).toHaveLength(2);
  expect(pages[0]).toMatchObject({ userId: TEST_USER.userId });
  expect(calls).not.toContain('listTransactions');
});

test('first sign-in creates the User record once, before onboarding', async ({ page }) => {
  await signInAs(page);
  let record: Vars | null = null;
  const creates: Vars[] = [];
  const { calls } = await mockAppSync(
    page,
    baseHandlers({
      // No record until something creates one
      getUser: () => record,
      createUser: (v) => {
        const input = (v as { input: Vars }).input;
        creates.push(input);
        record = { ...input, onboardingCompleted: false };
        return record;
      },
      createNotificationPreferences: (v) => ({ id: 'prefs-new', ...(v as { input: Vars }).input }),
    })
  );

  await page.goto('/');

  await expect.poll(() => creates.length, { timeout: 30_000 }).toBe(1);
  expect(creates[0]).toMatchObject({
    id: TEST_USER.userId,
    username: TEST_USER.username,
    email: TEST_USER.email,
    balance: 0,
    tosAccepted: true,
    privacyPolicyAccepted: true,
  });
  // The record exists before onboarding writes to it, so its progress saves land
  await expect.poll(() => calls.includes('createNotificationPreferences')).toBe(true);
  await page.waitForTimeout(1_000);
  expect(creates).toHaveLength(1);
});

test('tapping the avatar uploads a new picture and deletes the old one', async ({ page }) => {
  const OLD_KEY = `profile-pictures/${TEST_USER.userId}/avatar-1.jpg`;
  await signInAs(page);
  const s3 = await mockS3(page);
  const updates: Vars[] = [];
  await mockAppSync(
    page,
    baseHandlers(
      {
        updateUser: (v) => {
          updates.push((v as { input: Vars }).input);
          return { ...profile({ profilePictureUrl: OLD_KEY }), ...(v as { input: Vars }).input };
        },
      },
      { profilePictureUrl: OLD_KEY }
    )
  );

  await openAccount(page);

  const chooser = page.waitForEvent('filechooser', { timeout: 15_000 });
  await page.getByTestId('account-avatar').click();
  await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1X1 });

  // The record gets the new S3 key, not a signed URL
  await expect
    .poll(() => updates.find((u) => 'profilePictureUrl' in u)?.profilePictureUrl, { timeout: 15_000 })
    .toMatch(new RegExp(`^profile-pictures/${TEST_USER.userId}/avatar-\\d+\\.jpg$`));
  const newKey = updates.find((u) => 'profilePictureUrl' in u)!.profilePictureUrl as string;
  expect(newKey).not.toBe(OLD_KEY);

  // The replaced picture is removed. The old editor passed a signed URL where the key
  // belonged, so this delete never matched an object.
  expect(s3.calls.some((c) => c.method === 'DELETE' && c.key.endsWith(OLD_KEY))).toBe(true);

  // No editor screen, and the screen stayed up rather than reloading behind a spinner
  await expect(page.getByTestId('profile-editor-name')).toHaveCount(0);
  await expect(page.getByTestId('screen-account')).toBeVisible();
  await expect(page.getByTestId('account-avatar').locator('img')).toHaveAttribute(
    'src',
    new RegExp(newKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
});

test.describe('trust & safety', () => {
  const openTrustSafety = async (page: Page) => {
    await openAccount(page);
    await page.getByTestId('account-trust-safety').dispatchEvent('click');
    await expect(page.getByTestId('trust-email')).toBeVisible({ timeout: 15_000 });
  };

  test('shows the email address and writes nothing when the record is current', async ({ page }) => {
    await signInAs(page);
    await withCognitoPhone(page);
    const updates: Vars[] = [];
    await mockAppSync(
      page,
      baseHandlers(
        {
          updateUser: (v) => {
            updates.push((v as { input: Vars }).input);
            return { ...profile(), ...(v as { input: Vars }).input };
          },
        },
        { phoneNumber: PHONE, phoneNumberVerified: true, phoneNumberVerifiedAt: '2026-01-01T00:00:00.000Z' }
      )
    );

    await openTrustSafety(page);

    // The address, not the Cognito username
    await expect(page.getByTestId('trust-email')).toHaveText(TEST_USER.email);
    // Give a stray write time to land before asserting there was none
    await page.waitForTimeout(1_000);
    expect(updates.filter((u) => 'phoneNumber' in u)).toEqual([]);
  });

  test('copies a newly verified phone to the record once, stamping the time', async ({ page }) => {
    await signInAs(page);
    await withCognitoPhone(page);
    const updates: Vars[] = [];
    await mockAppSync(
      page,
      baseHandlers(
        {
          updateUser: (v) => {
            updates.push((v as { input: Vars }).input);
            return { ...profile(), ...(v as { input: Vars }).input };
          },
        },
        { phoneNumber: PHONE, phoneNumberVerified: false }
      )
    );

    await openTrustSafety(page);

    await expect.poll(() => updates.filter((u) => 'phoneNumber' in u)).toHaveLength(1);
    const write = updates.find((u) => 'phoneNumber' in u)!;
    expect(write).toMatchObject({ id: TEST_USER.userId, phoneNumber: PHONE, phoneNumberVerified: true });
    expect(typeof write.phoneNumberVerifiedAt).toBe('string');
  });
});
