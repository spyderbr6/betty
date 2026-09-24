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

/**
 * myBets used to be derived purely by filtering the platform-wide newest-200
 * ACTIVE window. There was no per-viewer query behind it, so once the platform
 * carried more than 200 open bets, a viewer's own older bet was not truncated at
 * the end of a list - it was absent. These two cover the passes that fixed it,
 * by answering the status window with nothing at all.
 */
test('a bet you created outside the status window still reaches My Bets', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, {
    ...baseHandlers(),
    betsByStatus: list(),
    betsByCreator: (variables) =>
      variables.creatorId === TEST_USER.userId
        ? { items: [bet({ id: 'bet-mine' })], nextToken: null }
        : { items: [], nextToken: null },
  });

  await openApp(page);

  await expect(page.getByTestId('bet-card-bet-mine')).toBeVisible({ timeout: 15_000 });
});

test('a bet you joined outside the status window still reaches My Bets', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, {
    ...baseHandlers(),
    betsByStatus: list(),
    // Joined, not created: participantUserIds is denormalised onto the Bet but an
    // array cannot be a key, so the participant row is the only route in.
    participantsByUser: list([
      { id: 'participant-1', betId: 'bet-joined', userId: TEST_USER.userId, side: 'A', amount: 25 },
    ]),
    getBet: (variables) =>
      variables.id === 'bet-joined'
        ? bet({ id: 'bet-joined', creatorId: 'someone-else', creatorName: 'Someone Else' })
        : null,
  });

  await openApp(page);

  await expect(page.getByTestId('bet-card-bet-joined')).toBeVisible({ timeout: 15_000 });
});

test('a joined card gets your side from the bulk load', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, {
    ...baseHandlers(),
    betsByStatus: (variables) => ({
      items: variables.status === 'ACTIVE' ? [bet()] : [],
      nextToken: null,
    }),
    participantsByUser: list([
      { id: 'participant-1', betId: 'bet-1', userId: TEST_USER.userId, side: 'A', amount: 25 },
    ]),
  });

  await openApp(page);
  await expect(page.getByTestId('bet-card-bet-1')).toBeVisible({ timeout: 15_000 });

  // BetCard used to run its own Participant.list({ betId, userId }) for every
  // joined card - a filtered Scan, and on My Bets every card is one. The rows
  // now arrive with the bulk load through this indexed query instead.
  //
  // The zero assertion holds now. The call that used to survive here came from
  // UserBalance in the header, which ran Participant.observeQuery - observeQuery
  // issues an initial filtered list before it streams, so every screen paid for
  // a listUsers and a listParticipants Scan just to show a balance.
  expect(calls).toContain('participantsByUser');
  expect(calls).not.toContain('listParticipants');
}); 

test('participation is fetched newest-first, not oldest-first', async ({ page }) => {
  await signInAs(page);
  const seen: Record<string, unknown>[] = [];
  await mockAppSync(page, {
    ...baseHandlers(),
    participantsByUser: (variables) => {
      seen.push(variables);
      return { items: [], nextToken: null };
    },
  });

  await openApp(page);
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 15_000 });

  // The GSI sorts on joinedAt and DynamoDB scans ascending by default, so a
  // `limit` without sortDirection returns the OLDEST participations. The viewer's
  // most recent bets then have no side, and their cards fall back to showing
  // RESOLVED instead of WON/LOST. The mock cannot reproduce that ordering, so the
  // only honest check is that the request asked for DESC.
  expect(seen.length, 'participantsByUser was never called').toBeGreaterThan(0);
  expect(seen[0].sortDirection).toBe('DESC');
});
