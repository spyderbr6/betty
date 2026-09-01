import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync, one } from './fixtures/appsync';
import { TEST_USER, signInAs } from './fixtures/session';

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

const profile = {
  id: TEST_USER.userId,
  email: TEST_USER.email,
  displayName: TEST_USER.displayName,
  role: 'USER',
  balance: 250,
  trustScore: 100,
  totalBets: 0,
  totalWinnings: 0,
  winRate: 0,
};

/**
 * Shaped to what transformAmplifyBet actually reads, which is not the schema in
 * CLAUDE.md: `category` is mandatory (the transform returns null without it, and
 * the bet is silently dropped), side names arrive inside the `odds` JSON blob, and
 * the deadline field is `deadline`, not `expiresAt`.
 */
const bet = (over: Record<string, unknown> = {}) => ({
  id: 'bet-1',
  title: 'Chiefs cover the spread',
  description: 'Sunday night',
  category: 'SPORTS',
  betAmount: 25,
  odds: JSON.stringify({ sideAName: 'Chiefs', sideBName: 'Bills' }),
  status: 'ACTIVE',
  creatorId: TEST_USER.userId,
  creatorName: TEST_USER.displayName,
  isPrivate: false,
  sideACount: 1,
  sideBCount: 0,
  participantUserIds: [TEST_USER.userId],
  totalPot: 25,
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});
/**
 * Every operation the shell fires on boot, answered empty by default.
 *
 * Note `betsByStatus` / `squaresGamesByStatus`: BetDataContext loads through those
 * GSI queries, not `listBets`, so a fixture that only answers the list operations
 * leaves the screens permanently empty while every assertion still "passes".
 */
const baseHandlers = () => ({
  getUser: one(profile),
  listUsers: list(),
  betsByStatus: list(),
  listBets: list(),
  listParticipants: list(),
  squaresGamesByStatus: list(),
  listSquaresGames: list(),
  listSquaresPurchases: list(),
  listSquaresInvitations: list(),
  listBetInvitations: list(),
  listFriendships: list(),
  listFriendRequests: list(),
  notificationsByUser: list(),
  listEventCheckIns: list(),
  activeEventsByTime: list(),
});

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
