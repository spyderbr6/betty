import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';
import { baseHandlers, bet } from './fixtures/data';

/**
 * Covers the authenticated shell: that a session boots past the login screen,
 * that every tab mounts its screen, and that the bet list renders what the data
 * layer returned. auth.spec.ts covers everything up to sign-in; this picks up
 * immediately after it.
 *
 * These are the paths an Expo/React Native upgrade breaks most often — navigation,
 * context providers and safe-area layout — and none of them were reachable while
 * the suite stopped at the login form.
 */

const openApp = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
};

test('a seeded session boots straight into the app, not the login form', async ({ page }) => {
  await signInAs(page);
  const { unhandled } = await mockAppSync(page, baseHandlers());

  await openApp(page);
  await expect(page.getByTestId('login-submit')).toBeHidden();

  // A new unanswered query means the app started reading something this fixture
  // does not model — fail loudly rather than let a screen render empty forever.
  await page.waitForTimeout(3000);
  expect([...new Set(unhandled)]).toEqual([]);
});

test('each tab mounts its screen', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openApp(page);

  for (const [tab, screen] of [
    ['tab-create', 'screen-create-bet'],
    ['tab-live', 'screen-live'],
    ['tab-resolve', 'screen-resolve'],
    ['tab-account', 'screen-account'],
    ['tab-bets', 'screen-bets'],
  ] as const) {
    // dispatchEvent, not click(): the tab bar never settles for Playwright's
    // stability check, and even a forced click at coordinates does not reach
    // React Native Web's press handling. Dispatching hits the handler directly.
    await page.getByTestId(tab).dispatchEvent('click');
    await expect(page.getByTestId(screen)).toBeVisible({ timeout: 15_000 });
  }
});

test('renders a bet returned by the data layer', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, {
    ...baseHandlers(),
    // Answer per status: the context queries each status separately, and returning
    // the same bet for all of them renders duplicate cards.
    betsByStatus: (variables) => ({
      items: variables.status === 'ACTIVE' ? [bet()] : [],
      nextToken: null,
    }),
  });

  await openApp(page);

  await expect(page.getByTestId('bet-card-bet-1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Chiefs cover the spread')).toBeVisible();
});
