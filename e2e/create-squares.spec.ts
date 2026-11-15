import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * Setting up squares from Create (the design's "Squares setup"): a game list first, then
 * one setup screen, then a confirmation that leads to claiming your own squares.
 *
 * Creating writes the SquaresGame row from the app (no money moves until squares are
 * bought, through buySquares). Notifying friends writes a SquaresInvitation and a
 * notification each; the old form showed a friend picker and sent nothing.
 */

const DAY = 86_400_000;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

const upcoming = {
  id: 'event-up-1',
  externalId: 'espn-up-1',
  sport: 'NFL',
  league: 'NFL',
  homeTeam: 'Dallas Cowboys',
  awayTeam: 'Philadelphia Eagles',
  homeTeamCode: 'DAL',
  awayTeamCode: 'PHI',
  status: 'UPCOMING',
  round: '8',
  scheduledTime: iso(2 * DAY),
  isActive: 1,
  checkInCount: 0,
};
const otherUpcoming = {
  ...upcoming,
  id: 'event-up-2',
  externalId: 'espn-up-2',
  homeTeam: 'Chicago Bears',
  awayTeam: 'Green Bay Packers',
  homeTeamCode: 'CHI',
  awayTeamCode: 'GB',
  scheduledTime: iso(3 * DAY),
};
const liveCheckedIn = {
  ...upcoming,
  id: 'event-live',
  externalId: 'espn-live',
  homeTeam: 'Kansas City Chiefs',
  awayTeam: 'Buffalo Bills',
  status: 'LIVE',
  quarter: 'Q3',
  timeLeft: '4:12',
  homeScore: 14,
  awayScore: 10,
  scheduledTime: iso(-2 * 3600_000),
};
const friendship = { id: 'friendship-1', user1Id: TEST_USER.userId, user2Id: OTHER_USER.id, createdAt: iso(0) };
const friendsGrid = {
  id: 'squares-friend',
  title: 'PHI @ DAL Squares',
  creatorId: OTHER_USER.id,
  eventId: upcoming.id,
  status: 'ACTIVE',
  pricePerSquare: 5,
  totalPot: 0,
  squaresSold: 3,
  numbersAssigned: false,
  isPrivate: false,
  payoutStructure: JSON.stringify({ period1: 0.15, period2: 0.25, period3: 0.15, period4: 0.45 }),
  locksAt: upcoming.scheduledTime,
  createdAt: iso(0),
  updatedAt: iso(0),
};

type Handlers = Record<string, (variables: Record<string, unknown>) => unknown>;

const setup = async (page: Page, over: Handlers = {}) => {
  const games: Record<string, unknown>[] = [];
  const invitations: Record<string, unknown>[] = [];
  const events: Record<string, unknown> = { [upcoming.id]: upcoming, [otherUpcoming.id]: otherUpcoming, [liveCheckedIn.id]: liveCheckedIn };
  const mock = await mockAppSync(page, {
    ...baseHandlers({}, { balance: 250 }),
    activeEventsByTime: list([upcoming, otherUpcoming]),
    getLiveEvent: (variables) => events[variables.id as string] ?? null,
    friendshipsByUser1: list([friendship]),
    createSquaresGame: (variables) => {
      const input = (variables.input ?? variables) as Record<string, unknown>;
      games.push(input);
      return { id: 'squares-new', ...input };
    },
    createSquaresInvitation: (variables) => {
      const input = (variables.input ?? variables) as Record<string, unknown>;
      invitations.push(input);
      return { id: `sinv-${invitations.length}`, ...input };
    },
    createNotification: (variables) => ({ id: 'n-1', ...((variables.input ?? variables) as Record<string, unknown>) }),
    ...over,
  });
  return { games, invitations, calls: mock.calls };
};

const tap = (page: Page, testId: string) => page.getByTestId(testId).dispatchEvent('click');

const openSquares = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await tap(page, 'tab-create');
  await expect(page.getByTestId('screen-create-bet')).toBeVisible({ timeout: 15_000 });
  await tap(page, 'create-format-squares');
  await expect(page.getByTestId(`create-squares-game-${upcoming.id}`)).toBeVisible({ timeout: 15_000 });
};

test('squares start from a list of upcoming games, which search narrows', async ({ page }) => {
  await signInAs(page);
  await setup(page);
  await openSquares(page);

  await expect(page.getByTestId(`create-squares-game-${upcoming.id}`)).toContainText('Eagles');
  await expect(page.getByTestId(`create-squares-game-${upcoming.id}`)).toContainText('NFL · Week 8');
  await expect(page.getByTestId(`create-squares-game-${otherUpcoming.id}`)).toBeVisible();

  await page.getByTestId('create-squares-search').fill('packers');
  await expect(page.getByTestId(`create-squares-game-${upcoming.id}`)).toBeHidden();
  await expect(page.getByTestId(`create-squares-game-${otherUpcoming.id}`)).toBeVisible();
});

test('a checked-in game that has started is listed first but cannot take squares', async ({ page }) => {
  await signInAs(page);
  await setup(page, { checkInsByUser: list([{ id: 'c1', userId: TEST_USER.userId, eventId: liveCheckedIn.id, checkInTime: iso(0), isActive: true }]) });
  await openSquares(page);

  const row = page.getByTestId('create-squares-game-checked-in');
  await expect(row).toContainText('Already started · squares need a full game');
  await expect(row).toHaveAttribute('aria-disabled', 'true');
});

test('creating squares sends the price, the payout preset and who can join', async ({ page }) => {
  await signInAs(page);
  const { games, invitations } = await setup(page);
  await openSquares(page);

  await tap(page, `create-squares-game-${upcoming.id}`);
  await expect(page.getByTestId('create-squares-price')).toHaveText('$10');
  await expect(page.getByTestId('create-squares-pot')).toHaveText('Pot $1,000 when all 100 fill');
  await tap(page, 'create-squares-price-up');
  await expect(page.getByTestId('create-squares-pot')).toHaveText('Pot $1,500 when all 100 fill');
  await tap(page, 'create-squares-payout-final');
  await expect(page.getByTestId('create-submit')).toContainText('Create squares · $15 a square');
  await tap(page, 'create-submit');

  await expect(page.getByTestId('create-squares-created')).toBeVisible({ timeout: 15_000 });
  expect(games).toHaveLength(1);
  expect(games[0]).toMatchObject({
    eventId: upcoming.id,
    title: 'PHI @ DAL Squares',
    pricePerSquare: 15,
    isPrivate: false,
    status: 'ACTIVE',
  });
  expect(JSON.parse(games[0].payoutStructure as string)).toEqual({ period1: 0, period2: 0, period3: 0, period4: 1 });
  expect(invitations).toHaveLength(0);
  await expect(page.getByTestId('create-squares-created-summary')).toHaveText('$15 a square · 0 of 100 taken');
});

test('friends picked to notify are invited to the new grid', async ({ page }) => {
  await signInAs(page);
  const { invitations } = await setup(page);
  await openSquares(page);

  await tap(page, `create-squares-game-${upcoming.id}`);
  await tap(page, 'create-join-invited');
  await tap(page, `create-friend-${OTHER_USER.id}`);
  await tap(page, 'create-submit');

  await expect(page.getByTestId('create-squares-created')).toContainText('Casey was notified', { timeout: 15_000 });
  expect(invitations).toHaveLength(1);
  expect(invitations[0]).toMatchObject({ squaresGameId: 'squares-new', toUserId: OTHER_USER.id, status: 'PENDING' });
});

test('custom payouts must add up to 100% before the button works', async ({ page }) => {
  await signInAs(page);
  const { calls } = await setup(page);
  await openSquares(page);

  await tap(page, `create-squares-game-${upcoming.id}`);
  await tap(page, 'create-squares-payout-custom');
  await tap(page, 'create-squares-percent-0-up'); // 15 -> 20: total 105
  await expect(page.getByTestId('create-squares-percent-total')).toHaveText('Total 105% · must be 100%');
  await expect(page.getByTestId('create-submit')).toHaveAttribute('aria-disabled', 'true');

  await tap(page, 'create-squares-percent-3-down'); // 45 -> 40: total 100
  await expect(page.getByTestId('create-squares-percent-total')).toHaveText('Total 100%');
  await expect(page.getByTestId('create-submit')).not.toHaveAttribute('aria-disabled', 'true');
  expect(calls).not.toContain('createSquaresGame');
});

test("a friend's open grid on a game is pointed out, to join instead of duplicating", async ({ page }) => {
  await signInAs(page);
  await setup(page, {
    squaresGamesByStatus: (variables) => ({ items: variables.status === 'ACTIVE' ? [friendsGrid] : [], nextToken: null }),
  });
  await openSquares(page);

  await expect(page.getByTestId(`create-squares-game-${upcoming.id}`)).toContainText('Casey Friend has squares on this', {
    timeout: 15_000,
  });
  await expect(page.getByTestId(`create-squares-game-${otherUpcoming.id}`)).not.toContainText('has squares on this');

  // Picking that game offers their grid before setting up another
  await tap(page, `create-squares-game-${upcoming.id}`);
  await expect(page.getByTestId('create-squares-friend-grid')).toContainText('Join theirs');
});

test('the back arrow goes from the setup to the game list, then back to the bet', async ({ page }) => {
  await signInAs(page);
  await setup(page);
  await openSquares(page);

  await tap(page, `create-squares-game-${upcoming.id}`);
  await expect(page.getByTestId('create-squares-setup')).toBeVisible();
  await tap(page, 'create-squares-back');
  await expect(page.getByTestId(`create-squares-game-${upcoming.id}`)).toBeVisible();
  await tap(page, 'create-squares-back');
  await expect(page.getByTestId('create-title')).toBeVisible();
});
