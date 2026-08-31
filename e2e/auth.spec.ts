import { expect, test } from '@playwright/test';
import { codeDelivery, fail, mockCognito, ok } from './fixtures/cognito';

// The app boots Amplify and registers a service worker before the login form
// paints, so every test waits for the first control rather than a fixed delay.
const gotoLogin = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.getByTestId('login-submit')).toBeVisible({ timeout: 30_000 });
};

test.describe('password reset', () => {
  test('reaches the reset screen from login and back again', async ({ page }) => {
    await gotoLogin(page);

    await page.getByTestId('login-forgot-password').click();
    await expect(page.getByTestId('forgot-send-code')).toBeVisible();

    await page.getByTestId('forgot-back-to-login').click();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('requires an email before requesting a code', async ({ page }) => {
    await gotoLogin(page);
    await page.getByTestId('login-forgot-password').click();

    await page.getByTestId('forgot-send-code').click();
    await expect(page.getByTestId('forgot-error')).toContainText('enter your email address');
  });

  test('advances to the code step and shows the masked destination', async ({ page }) => {
    await mockCognito(page, { ForgotPassword: codeDelivery('b***@g***.com') });
    await gotoLogin(page);

    await page.getByTestId('login-forgot-password').click();
    await page.getByTestId('forgot-email').fill('someone@example.com');
    await page.getByTestId('forgot-send-code').click();

    await expect(page.getByTestId('forgot-destination')).toContainText('b***@g***.com');
    await expect(page.getByTestId('forgot-resend')).toBeVisible();
  });

  test('does not reveal whether an account exists', async ({ page }) => {
    await mockCognito(page, {
      ForgotPassword: fail('UserNotFoundException', 'User does not exist.'),
    });
    await gotoLogin(page);

    await page.getByTestId('login-forgot-password').click();
    await page.getByTestId('forgot-email').fill('nobody@example.com');
    await page.getByTestId('forgot-send-code').click();

    // Same screen a real account reaches — no error, no confirmation either way.
    await expect(page.getByTestId('forgot-code')).toBeVisible();
    await expect(page.getByTestId('forgot-error')).toBeHidden();
  });

  test('guards mismatched and too-short passwords before calling Cognito', async ({ page }) => {
    const { calls } = await mockCognito(page, { ForgotPassword: codeDelivery() });
    await gotoLogin(page);

    await page.getByTestId('login-forgot-password').click();
    await page.getByTestId('forgot-email').fill('someone@example.com');
    await page.getByTestId('forgot-send-code').click();
    await expect(page.getByTestId('forgot-code')).toBeVisible();

    await page.getByTestId('forgot-code').fill('123456');
    await page.getByTestId('forgot-new-password').fill('Str0ngPass!x');
    await page.getByTestId('forgot-confirm-password').fill('Different1!');
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-error')).toContainText('Passwords do not match');

    await page.getByTestId('forgot-new-password').fill('Ab1!');
    await page.getByTestId('forgot-confirm-password').fill('Ab1!');
    await page.getByTestId('forgot-submit').click();
    await expect(page.getByTestId('forgot-error')).toContainText('at least 8 characters');

    // Neither invalid attempt should have reached the server.
    expect(calls.filter((c) => c === 'ConfirmForgotPassword')).toHaveLength(0);
  });

  test('maps a rejected code to actionable copy', async ({ page }) => {
    await mockCognito(page, {
      ForgotPassword: codeDelivery(),
      ConfirmForgotPassword: fail('CodeMismatchException', 'Invalid verification code provided.'),
    });
    await gotoLogin(page);

    await page.getByTestId('login-forgot-password').click();
    await page.getByTestId('forgot-email').fill('someone@example.com');
    await page.getByTestId('forgot-send-code').click();

    await page.getByTestId('forgot-code').fill('123456');
    await page.getByTestId('forgot-new-password').fill('Str0ngPass!x');
    await page.getByTestId('forgot-confirm-password').fill('Str0ngPass!x');
    await page.getByTestId('forgot-submit').click();

    await expect(page.getByTestId('forgot-error')).toContainText('That code is not correct');
  });

  test('confirms a resend', async ({ page }) => {
    await mockCognito(page, { ForgotPassword: codeDelivery() });
    await gotoLogin(page);

    await page.getByTestId('login-forgot-password').click();
    await page.getByTestId('forgot-email').fill('someone@example.com');
    await page.getByTestId('forgot-send-code').click();
    await expect(page.getByTestId('forgot-code')).toBeVisible();

    await page.getByTestId('forgot-resend').click();
    await expect(page.getByTestId('forgot-info')).toContainText('A new code is on its way');
  });
});

test.describe('sign up', () => {
  test('falls back to the manual prompt when auto sign-in fails', async ({ page }) => {
    // InitiateAuth is left unhandled on purpose: mockCognito answers it with a
    // 500, which is exactly the auto sign-in failure this test exercises.
    const { calls } = await mockCognito(page, {
      SignUp: ok({
        UserConfirmed: false,
        UserSub: '11111111-2222-3333-4444-555555555555',
        CodeDeliveryDetails: { AttributeName: 'email', DeliveryMedium: 'EMAIL', Destination: 't***@e***.com' },
      }),
      ConfirmSignUp: ok(),
    });
    await gotoLogin(page);

    await page.getByTestId('login-create-account').click();
    await page.getByTestId('signup-display-name').fill('Test User');
    await page.getByTestId('signup-email').fill('test@example.com');
    await page.getByTestId('signup-password').fill('Str0ngPass!x');
    await page.getByTestId('signup-phone').fill('4155309876');
    await page.getByTestId('signup-accept-tos').click();
    await page.getByTestId('signup-accept-privacy').click();
    await page.getByTestId('signup-submit').click();

    await expect(page.getByTestId('signup-code')).toBeVisible();
    await page.getByTestId('signup-code').fill('123456');
    await page.getByTestId('signup-confirm-submit').click();

    // The account is confirmed, so the user must still be told they can sign in
    // rather than being left on a dead confirmation screen.
    await expect(page.getByText('Account Created Successfully')).toBeVisible({ timeout: 20_000 });
    expect(calls).toContain('ConfirmSignUp');
    expect(calls).toContain('InitiateAuth');
  });
});
