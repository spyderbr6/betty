import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { baseHandlers } from './fixtures/data';
import { signInAs } from './fixtures/session';

/**
 * Validation on the create-bet form.
 *
 * handleCreateBet checks five things in order: required fields, amount, side,
 * deadline, then balance. The side check is unreachable from the UI — the submit
 * button is disabled while selectedSide is null — so the first test pins that
 * behaviour down instead, and the rest drive the reachable branches.
 *
 * Amount and deadline default to '1' and '30', so neither is blank on arrival;
 * tests that want them invalid have to clear them explicitly.
 */

const openCreateTab = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  // dispatchEvent: React Native Web's press handling does not respond to a
  // synthesised coordinate click, and the tab bar never settles for Playwright's
  // stability check.
  await page.getByTestId('tab-create').dispatchEvent('click');
  await expect(page.getByTestId('screen-create-bet')).toBeVisible({ timeout: 15_000 });
};

const submit = (page: Page) => page.getByTestId('create-submit').dispatchEvent('click');

const fillBasics = async (page: Page) => {
  await page.getByTestId('create-title').fill('Chiefs cover the spread');
  await page.getByTestId('create-description').fill('Sunday night game');
};

test('the submit button is disabled until a side is picked', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await fillBasics(page);
  // React Native Web renders TouchableOpacity as a <div aria-disabled>, not a
  // <button disabled>, so toBeDisabled() never matches here.
  await expect(page.getByTestId('create-submit')).toHaveAttribute('aria-disabled', 'true');

  await page.getByTestId('create-side-a').dispatchEvent('click');
  await expect(page.getByTestId('create-submit')).not.toHaveAttribute('aria-disabled', 'true');
});

test('rejects a whitespace-only title and description', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  // Whitespace rather than an empty string: the template seeds both fields, and
  // validation trims before checking, so "   " exercises the same branch as blank
  // input while still registering as a change on a React Native Web input.
  await page.getByTestId('create-title').fill('   ');
  await page.getByTestId('create-description').fill('   ');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Missing Information');
  await expect(page.getByTestId('alert-message')).toHaveText('Please fill in all required fields.');
});

test('rejects a zero bet amount', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await fillBasics(page);
  await page.getByTestId('create-amount').fill('0');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Invalid Amount');
});

test('rejects a zero deadline', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await fillBasics(page);
  await page.getByTestId('create-deadline').fill('0');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Invalid Deadline');
});

test('blocks creation when the balance will not cover the stake', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers({}, { balance: 5 }));
  await openCreateTab(page);

  await fillBasics(page);
  await page.getByTestId('create-amount').fill('50');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Insufficient Funds');
  // The exact figures matter: this copy is what tells the user how short they are.
  await expect(page.getByTestId('alert-message')).toContainText('You need $50.00');
  await expect(page.getByTestId('alert-message')).toContainText('you only have $5.00');
});
