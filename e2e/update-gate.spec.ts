import { expect, test } from '@playwright/test';
import { mockAppSync, one } from './fixtures/appsync';
import { signInAs } from './fixtures/session';
import { baseHandlers } from './fixtures/data';

/**
 * The minimum-version gate (security plan step 4). At launch the app reads AppConfig
 * 'global'; a build older than its minimumVersion sees only the update screen. This
 * bundle's version is app.json's "version".
 */

const config = (minimumVersion: string) =>
  one({ id: 'global', minimumVersion, updateUrl: 'https://example.com/sidebet.apk', updateMessage: null, createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z' });

test('a build older than the minimum version sees only the update screen', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers({ getAppConfig: config('99.0.0') }));
  await page.goto('/');

  await expect(page.getByTestId('update-required')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('update-required-link')).toBeVisible();
  await expect(page.getByTestId('screen-bets')).toBeHidden();
});

test('a build at or above the minimum version runs normally', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers({ getAppConfig: config('0.0.1') }));
  await page.goto('/');

  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await expect(page.getByTestId('update-required')).toBeHidden();
});
