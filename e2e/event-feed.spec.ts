import { expect, test, type Page } from '@playwright/test';
import { mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers, joinableBet } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * The Join tab as a single friends feed, with items at the viewer's checked-in
 * event surfaced rather than split into their own list.
 *
 * Two things these tests are really guarding:
 *
 * 1. That the feed is assembled from indexed queries. Every read here used to be
 *    a filtered Scan, which applies its limit to rows examined rather than rows
 *    returned and so goes quietly incomplete as a table grows. The operation-name
 *    assertions below fail if anything regresses to `.list({filter})`.
 * 2. That `isPrivate` is filtered server-side. The mock answers with whatever the
 *    handler returns regardless of the filter, so a private item cannot be proven
 *    hidden by handing it over and expecting it to vanish — the only honest check
 *    is that the request carried the filter. Hence assertions on variables.
 */

const EVENT_ID = 'event-tonight';
const OTHER_EVENT_ID = 'event-elsewhere';

const friendship = {
  id: 'friendship-1',
  user1Id: TEST_USER.userId,
  user2Id: OTHER_USER.id,
  createdAt: new Date().toISOString(),
};

const liveEvent = {
  id: EVENT_ID,
  externalId: 'ext-1',
  sport: 'NFL',
  league: 'NFL',
  homeTeam: 'Chiefs',
  awayTeam: 'Bills',
  homeTeamCode: 'KC',
  awayTeamCode: 'BUF',
  homeScore: 0,
  awayScore: 0,
  status: 'LIVE',
  scheduledTime: new Date().toISOString(),
  isActive: 1,
  checkInCount: 2,
};

const checkIn = {
  id: 'checkin-1',
  userId: TEST_USER.userId,
  eventId: EVENT_ID,
  checkInTime: new Date().toISOString(),
  isActive: true,
};

/** Records the variables each operation was called with, for filter assertions. */
type Seen = Record<string, Record<string, unknown>>;

const handlers = (opts: {
  friendBets?: unknown[];
  friendGames?: unknown[];
  checkedIn?: boolean;
  seen?: Seen;
}) => {
  const capture = (name: string, value: unknown) => (variables: Record<string, unknown>) => {
    if (opts.seen) opts.seen[name] = variables;
    return value;
  };

  return baseHandlers({
    friendshipsByUser1: capture('friendshipsByUser1', { items: [friendship], nextToken: null }),
    friendshipsByUser2: capture('friendshipsByUser2', { items: [], nextToken: null }),
    betsByCreator: capture('betsByCreator', {
      items: opts.friendBets ?? [],
      nextToken: null,
    }),
    squaresGamesByCreator: capture('squaresGamesByCreator', {
      items: opts.friendGames ?? [],
      nextToken: null,
    }),
    checkInsByUser: capture('checkInsByUser', {
      items: opts.checkedIn === false ? [] : [checkIn],
      nextToken: null,
    }),
    getLiveEvent: () => liveEvent,
    betInvitationsByToUser: () => ({ items: [], nextToken: null }),
    squaresInvitationsByToUser: () => ({ items: [], nextToken: null }),
    purchasesByBuyer: () => ({ items: [], nextToken: null }),
  });
};

const openFeed = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tab-live').dispatchEvent('click');
  await expect(page.getByTestId('screen-live')).toBeVisible({ timeout: 15_000 });
};

test('the feed is built from indexed queries, not scans', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, handlers({ friendBets: [joinableBet()] }));
  await openFeed(page);
  await expect(page.getByTestId('feed-list')).toBeVisible({ timeout: 15_000 });

  // The indexed reads this feature added.
  expect(calls).toContain('friendshipsByUser1');
  expect(calls).toContain('friendshipsByUser2');
  expect(calls).toContain('betsByCreator');

  // The Scans they replaced. Any of these reappearing is the regression.
  expect(calls).not.toContain('listFriendships');
  expect(calls).not.toContain('listBetInvitations');
  expect(calls).not.toContain('listEventCheckIns');
  expect(calls).not.toContain('listSquaresPurchases');
});

test('private items are excluded by the server, not the client', async ({ page }) => {
  await signInAs(page);
  const seen: Seen = {};
  await mockAppSync(page, handlers({ friendBets: [joinableBet()], seen }));
  await openFeed(page);
  await expect(page.getByTestId('feed-list')).toBeVisible({ timeout: 15_000 });

  const filter = seen.betsByCreator?.filter as Record<string, any> | undefined;
  expect(filter?.isPrivate).toEqual({ eq: false });
  expect(filter?.status).toEqual({ eq: 'ACTIVE' });
});

test("a friend's bet at the event you are checked into is marked", async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, handlers({ friendBets: [joinableBet({ eventId: EVENT_ID })] }));
  await openFeed(page);

  await expect(page.getByTestId('feed-item-at-event-bet-open')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('feed-chip-bet-open')).toBeVisible();
  await expect(page.getByTestId('feed-event-context')).toContainText('Bills @ Chiefs');
});

test("a friend's bet at another event still shows, without the marker", async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, handlers({ friendBets: [joinableBet({ eventId: OTHER_EVENT_ID })] }));
  await openFeed(page);

  await expect(page.getByTestId('feed-item-bet-open')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('feed-item-at-event-bet-open')).toHaveCount(0);
});

test('bets past their deadline are not offered', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    handlers({
      friendBets: [joinableBet({ deadline: new Date(Date.now() - 60_000).toISOString() })],
    })
  );
  await openFeed(page);

  await expect(page.getByTestId('feed-empty')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('feed-item-bet-open')).toHaveCount(0);
});

test('bets and squares appear in one list', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    handlers({
      friendBets: [joinableBet({ eventId: EVENT_ID })],
      friendGames: [
        {
          id: 'squares-1',
          title: 'Bills @ Chiefs Squares',
          creatorId: OTHER_USER.id,
          eventId: EVENT_ID,
          status: 'ACTIVE',
          pricePerSquare: 10,
          totalPot: 100,
          squaresSold: 10,
          numbersAssigned: false,
          isPrivate: false,
          createdAt: new Date().toISOString(),
        },
      ],
    })
  );
  await openFeed(page);

  await expect(page.getByTestId('feed-list')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('feed-count')).toContainText('2 available to join');
});

test('with no check-in the feed still lists friends items, unmarked', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    handlers({ friendBets: [joinableBet({ eventId: EVENT_ID })], checkedIn: false })
  );
  await openFeed(page);

  await expect(page.getByTestId('feed-item-bet-open')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('feed-event-context')).toHaveCount(0);
});

test('the event filter narrows the feed to the checked-in event', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    handlers({
      friendBets: [
        joinableBet({ id: 'bet-here', eventId: EVENT_ID }),
        joinableBet({ id: 'bet-there', eventId: OTHER_EVENT_ID }),
      ],
    })
  );
  await openFeed(page);

  // Both are offered by default: the event only sorts and marks, it does not hide.
  await expect(page.getByTestId('feed-item-at-event-bet-here')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('feed-item-bet-there')).toBeVisible();

  await page.getByTestId('feed-event-filter').dispatchEvent('click');

  await expect(page.getByTestId('feed-item-at-event-bet-here')).toBeVisible();
  await expect(page.getByTestId('feed-item-bet-there')).toHaveCount(0);

  // And back, so the control cannot strand the viewer in a narrowed feed.
  await page.getByTestId('feed-event-filter').dispatchEvent('click');
  await expect(page.getByTestId('feed-item-bet-there')).toBeVisible();
});

test('the event filter is absent when nothing is at your event', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(
    page,
    handlers({ friendBets: [joinableBet({ id: 'bet-there', eventId: OTHER_EVENT_ID })] })
  );
  await openFeed(page);

  await expect(page.getByTestId('feed-item-bet-there')).toBeVisible({ timeout: 15_000 });
  // Offering a filter that would empty the list is worse than offering none.
  await expect(page.getByTestId('feed-event-filter')).toHaveCount(0);
});
