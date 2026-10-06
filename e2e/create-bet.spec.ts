import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { baseHandlers } from './fixtures/data';
import { signInAs } from './fixtures/session';

/**
 * The create-bet form.
 *
 * handleCreateBet checks four things on the phone, in order: required fields,
 * amount, side, deadline. The side check is unreachable from the UI — the submit
 * button is disabled while selectedSide is null — so the first test pins that
 * behaviour down instead, and the rest drive the reachable branches.
 *
 * Then it makes one call: the server's createBetWithStake checks everything again
 * plus the balance, and writes the bet, the creator's participant row and the
 * stake in one transaction. The app writes none of them.
 *
 * Amount and deadline default to '1' and '30', so neither is blank on arrival;
 * tests that want them invalid have to clear them explicitly.
 */

/** The writes the app used to make itself; none may happen now. */
const CLIENT_MONEY_WRITES = ['createBet', 'createParticipant', 'createTransaction', 'updateUser', 'deleteBet', 'deleteParticipant'];

/** createBetWithStake returns AWSJSON: the answer arrives as JSON text. */
const answer = (value: Record<string, unknown>) => JSON.stringify(value);

const openCreateTab = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  // dispatchEvent: React Native Web's press handling does not respond to a
  // synthesised coordinate click, and the tab bar never settles for Playwright's
  // stability check.
  await page.getByTestId('tab-create').dispatchEvent('click');
  await expect(page.getByTestId('screen-create-bet')).toBeVisible({ timeout: 15_000 });
};


/**
 * Replace a numeric field value.
 *
 * fill() alone is unreliable on these inputs. They are controlled React Native
 * Web TextInputs: fill() clears the DOM value, but React re-renders from state
 * before the input event is handled, so the typed text can land after the
 * existing value - filling 50 over the default 1 produced 150. Selecting the
 * existing content first makes the replacement explicit.
 */
const replaceValue = async (page: Page, testId: string, value: string) => {
  const field = page.getByTestId(testId);
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.fill(value);
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
  await replaceValue(page, 'create-amount', '0');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Invalid Amount');
});

test('rejects a zero deadline', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await fillBasics(page);
  await replaceValue(page, 'create-deadline', '0');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Invalid Deadline');
});

test('blocks creation when the balance will not cover the stake', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, {
    ...baseHandlers({}, { balance: 5 }),
    // The server checks the balance; the answer carries what it found
    createBetWithStake: () => answer({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 5, required: 50 }),
  });
  await openCreateTab(page);

  await fillBasics(page);
  await replaceValue(page, 'create-amount', '50');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Insufficient Funds');
  // The exact figures matter: this copy is what tells the user how short they are.
  await expect(page.getByTestId('alert-message')).toContainText('You need $50.00');
  await expect(page.getByTestId('alert-message')).toContainText('you only have $5.00');
  for (const write of CLIENT_MONEY_WRITES) expect(calls).not.toContain(write);
});

test('creating a bet is one server call carrying the form, and the form resets', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  const { calls } = await mockAppSync(page, {
    ...baseHandlers({}, { balance: 250 }),
    createBetWithStake: (variables) => {
      sent.push(variables);
      return answer({ status: 'created', betId: variables.betId, balance: 200 });
    },
  });
  await openCreateTab(page);

  await fillBasics(page);
  await replaceValue(page, 'create-amount', '50');
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);

  // The form resets once the bet exists
  await expect(page.getByTestId('create-title')).not.toHaveValue('Chiefs cover the spread', { timeout: 15_000 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    title: 'Chiefs cover the spread',
    description: 'Sunday night game',
    amount: 50,
    side: 'A',
    deadlineMinutes: 30,
  });
  expect(sent[0].betId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const write of CLIENT_MONEY_WRITES) expect(calls).not.toContain(write);
});

test('a retry after a failed call reuses the bet id, so a lost answer cannot make two bets', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  await mockAppSync(page, {
    ...baseHandlers({}, { balance: 250 }),
    // The first call fails outright (did it go through? the app cannot tell); the second answers
    createBetWithStake: (variables) => {
      sent.push(variables);
      return sent.length === 1 ? null : answer({ status: 'created', betId: variables.betId, balance: 200 });
    },
  });
  await openCreateTab(page);

  await fillBasics(page);
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);
  await expect(page.getByTestId('alert-title')).toHaveText('Error');
  await page.getByTestId('alert-button-ok').dispatchEvent('click');

  await submit(page);
  await expect(page.getByTestId('create-title')).not.toHaveValue('Chiefs cover the spread', { timeout: 15_000 });
  expect(sent).toHaveLength(2);
  expect(sent[1].betId).toBe(sent[0].betId);
});

test('after a refusal the next attempt is a new bet id', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  await mockAppSync(page, {
    ...baseHandlers({}, { balance: 5 }),
    createBetWithStake: (variables) => {
      sent.push(variables);
      return answer({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 5, required: 1 });
    },
  });
  await openCreateTab(page);

  await fillBasics(page);
  await page.getByTestId('create-side-a').dispatchEvent('click');
  await submit(page);
  await expect(page.getByTestId('alert-title')).toHaveText('Insufficient Funds');
  await page.getByTestId('alert-button-ok').dispatchEvent('click');
  await submit(page);
  await expect.poll(() => sent.length).toBe(2);
  // A refusal wrote nothing, so reusing its id would gain nothing
  expect(sent[1].betId).not.toBe(sent[0].betId);
});
