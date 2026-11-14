import { expect, test, type Page } from '@playwright/test';
import { list, mockAppSync } from './fixtures/appsync';
import { OTHER_USER, baseHandlers } from './fixtures/data';
import { TEST_USER, signInAs } from './fixtures/session';

/**
 * The Create screen (the "Create Bet Final" design): game first, built for repeat bets.
 *
 * The phone checks the draft (services/createBetFlowLogic.ts, unit tested) and then makes
 * one call: the server's createBetWithStake checks everything again plus the balance, and
 * writes the bet, the creator's participant row and the stake in one transaction. The app
 * writes none of them; it sends the invitations afterwards.
 *
 * The stake starts at $5 (no last stake in a fresh browser), closing time at 1 hour away
 * from a game and 15 minutes at a live one, and the sides at Yes / No away from a game and
 * the two teams at one.
 */

/** The writes the app used to make itself; none may happen now. */
const CLIENT_MONEY_WRITES = ['createBet', 'createParticipant', 'createTransaction', 'updateUser', 'deleteBet', 'deleteParticipant'];

/** The money mutations return AWSJSON: the answer arrives as JSON text. */
const answer = (value: Record<string, unknown>) => JSON.stringify(value);

const EVENT_ID = 'event-live-1';
const liveEvent = {
  id: EVENT_ID,
  externalId: 'ext-1',
  sport: 'NFL',
  league: 'NFL',
  homeTeam: 'Kansas City Chiefs',
  awayTeam: 'Buffalo Bills',
  homeTeamCode: 'KC',
  awayTeamCode: 'BUF',
  homeScore: 14,
  awayScore: 10,
  status: 'LIVE',
  quarter: 'Q3',
  timeLeft: '4:12',
  scheduledTime: new Date().toISOString(),
  isActive: 1,
  checkInCount: 2,
};
const checkIn = (userId: string) => ({
  id: `checkin-${userId}`,
  userId,
  eventId: EVENT_ID,
  checkInTime: new Date().toISOString(),
  isActive: true,
});
const friendship = { id: 'friendship-1', user1Id: TEST_USER.userId, user2Id: OTHER_USER.id, createdAt: new Date().toISOString() };

type Handlers = Record<string, (variables: Record<string, unknown>) => unknown>;

/** You at a live game, with Casey (a friend) checked in to it too. */
const atTheGame = (): Handlers => ({
  checkInsByUser: list([checkIn(TEST_USER.userId)]),
  getLiveEvent: () => liveEvent,
  friendshipsByUser1: list([friendship]),
  checkInsByEvent: list([checkIn(TEST_USER.userId), checkIn(OTHER_USER.id)]),
});

/** Answers every create with success and records what was sent. */
const recordCreates = async (page: Page, over: Handlers = {}, me: Record<string, unknown> = { balance: 250 }) => {
  const sent: Record<string, unknown>[] = [];
  const invitations: Record<string, unknown>[] = [];
  const mock = await mockAppSync(page, {
    ...baseHandlers({}, me),
    createBetWithStake: (variables) => {
      sent.push(variables);
      return answer({ status: 'created', betId: variables.betId, balance: 245 });
    },
    createBetInvitation: (variables) => {
      const input = (variables.input ?? variables) as Record<string, unknown>;
      invitations.push(input);
      return { id: `inv-${invitations.length}`, ...input };
    },
    createNotification: (variables) => ({ id: 'n-1', ...((variables.input ?? variables) as Record<string, unknown>) }),
    ...over,
  });
  return { sent, invitations, calls: mock.calls };
};

const openCreateTab = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByTestId('screen-bets')).toBeVisible({ timeout: 30_000 });
  // dispatchEvent: React Native Web's press handling does not respond to a
  // synthesised coordinate click, and the tab bar never settles for Playwright's
  // stability check.
  await page.getByTestId('tab-create').dispatchEvent('click');
  await expect(page.getByTestId('screen-create-bet')).toBeVisible({ timeout: 15_000 });
};

const tap = (page: Page, testId: string) => page.getByTestId(testId).dispatchEvent('click');
const submit = (page: Page) => tap(page, 'create-submit');

/** Type a stake: tap the amount to turn it into a field. */
const typeStake = async (page: Page, value: string) => {
  await tap(page, 'create-stake-value');
  const field = page.getByTestId('create-amount');
  await field.press('ControlOrMeta+a');
  await field.fill(value);
  await field.press('Enter');
};

// ---------------------------------------------------------------------------
// Away from a game
// ---------------------------------------------------------------------------

test('starts on Yes / No, and the button waits for a side', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await expect(page.getByTestId('create-side-a')).toContainText('Yes');
  await expect(page.getByTestId('create-side-b')).toContainText('No');
  // React Native Web renders TouchableOpacity as a <div aria-disabled>, not a
  // <button disabled>, so toBeDisabled() never matches here.
  await expect(page.getByTestId('create-submit')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('create-submit')).toContainText('Pick your side');

  await tap(page, 'create-side-a');
  await expect(page.getByTestId('create-submit')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('create-submit')).toContainText('Create · $5 on Yes');
  await expect(page.getByTestId('create-submit-detail')).toContainText('Friends');
});

test('asks for the question before sending anything', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('   ');
  await tap(page, 'create-side-a');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText("What's the bet?");
  expect(calls).not.toContain('createBetWithStake');
});

test('creating a bet is one server call carrying the form, then the sent panel', async ({ page }) => {
  await signInAs(page);
  const { sent, calls } = await recordCreates(page);
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('Sam makes the 8:15 train');
  await tap(page, 'create-stake-up'); // $5 -> $10
  await tap(page, 'create-side-b');
  await submit(page);

  await expect(page.getByTestId('create-sent')).toBeVisible({ timeout: 15_000 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    title: 'Sam makes the 8:15 train',
    // No details typed and no game: the question stands in for the required description
    description: 'Sam makes the 8:15 train',
    category: 'CUSTOM',
    amount: 10,
    side: 'B',
    sideAName: 'Yes',
    sideBName: 'No',
    deadlineMinutes: 60,
    isPrivate: false,
  });
  expect(sent[0]).not.toHaveProperty('options');
  expect(sent[0]).not.toHaveProperty('maxParticipants');
  expect(sent[0].betId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await expect(page.getByTestId('create-sent-summary')).toContainText('You: No · $10.00');
  for (const write of CLIENT_MONEY_WRITES) expect(calls).not.toContain(write);
});

test('details, a typed stake, a closing time and Invited only all reach the server', async ({ page }) => {
  await signInAs(page);
  const { sent } = await recordCreates(page);
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('Rain before noon');
  await tap(page, 'create-add-details');
  await page.getByTestId('create-description').fill('Measured at the airport');
  await typeStake(page, '7.5');
  await tap(page, 'create-close-time');
  await tap(page, 'create-close-30m');
  await tap(page, 'create-join-invited');
  await tap(page, 'create-side-a');
  await expect(page.getByTestId('create-submit-detail')).toContainText('Invited only');
  await submit(page);

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
  expect(sent[0]).toMatchObject({
    description: 'Measured at the airport',
    amount: 7.5,
    deadlineMinutes: 30,
    isPrivate: true,
  });
});

test('a typed stake of zero is ignored', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await typeStake(page, '0');
  await expect(page.getByTestId('create-stake-value')).toHaveText('$5');
});

test('a stake above the balance turns the button into Add funds', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, baseHandlers({}, { balance: 8 }));
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('Rain before noon');
  await tap(page, 'create-side-a');
  await expect(page.getByTestId('create-submit')).toContainText('Create · $5 on Yes');
  await tap(page, 'create-stake-up'); // $10, over the $8 balance
  await expect(page.getByTestId('create-submit')).toContainText('Add funds');
  await submit(page);

  await expect(page.getByTestId('add-funds-modal')).toBeVisible();
  expect(calls).not.toContain('createBetWithStake');
});

test('a server refusal for funds still explains the shortfall', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, {
    ...baseHandlers({}, { balance: 250 }),
    // The balance moved since the screen read it; the server's answer carries what it found
    createBetWithStake: () => answer({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 3, required: 5 }),
  });
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('Rain before noon');
  await tap(page, 'create-side-a');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Insufficient Funds');
  await expect(page.getByTestId('alert-message')).toContainText('You need $5.00');
  await expect(page.getByTestId('alert-message')).toContainText('you only have $3.00');
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
      return sent.length === 1 ? null : answer({ status: 'created', betId: variables.betId, balance: 245 });
    },
  });
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('Rain before noon');
  await tap(page, 'create-side-a');
  await submit(page);
  await expect(page.getByTestId('alert-title')).toHaveText('Error');
  await tap(page, 'alert-button-ok');

  await submit(page);
  await expect(page.getByTestId('create-sent')).toBeVisible({ timeout: 15_000 });
  expect(sent).toHaveLength(2);
  expect(sent[1].betId).toBe(sent[0].betId);
});

test('after a refusal the next attempt is a new bet id', async ({ page }) => {
  await signInAs(page);
  const sent: Record<string, unknown>[] = [];
  await mockAppSync(page, {
    ...baseHandlers({}, { balance: 250 }),
    createBetWithStake: (variables) => {
      sent.push(variables);
      return answer({ status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: 1, required: 5 });
    },
  });
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('Rain before noon');
  await tap(page, 'create-side-a');
  await submit(page);
  await expect(page.getByTestId('alert-title')).toHaveText('Insufficient Funds');
  await tap(page, 'alert-button-ok');
  await submit(page);
  await expect.poll(() => sent.length).toBe(2);
  // A refusal wrote nothing, so reusing its id would gain nothing
  expect(sent[1].betId).not.toBe(sent[0].betId);
});

test('Another bet clears the question and keeps the stake and closing time', async ({ page }) => {
  await signInAs(page);
  const { sent } = await recordCreates(page);
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('First one');
  await tap(page, 'create-stake-up');
  await tap(page, 'create-close-time');
  await tap(page, 'create-close-15m');
  await tap(page, 'create-side-a');
  await submit(page);
  await expect(page.getByTestId('create-again')).toContainText('Keeps $10 · 15 min');
  await tap(page, 'create-again');

  await expect(page.getByTestId('create-title')).toHaveValue('');
  await expect(page.getByTestId('create-stake-value')).toHaveText('$10');
  await expect(page.getByTestId('create-close-time')).toContainText('15 min');
  // The pick does not carry over: each bet is backed on purpose
  await expect(page.getByTestId('create-submit')).toHaveAttribute('aria-disabled', 'true');

  await page.getByTestId('create-title').fill('Second one');
  await tap(page, 'create-side-b');
  await submit(page);
  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(2);
  expect(sent[1]).toMatchObject({ title: 'Second one', amount: 10, deadlineMinutes: 15, side: 'B' });
  expect(sent[1].betId).not.toBe(sent[0].betId);
});

test('Close betting ends the new bet early, through the server', async ({ page }) => {
  await signInAs(page);
  const ended: Record<string, unknown>[] = [];
  const { sent } = await recordCreates(page, {
    endBetEarly: (variables) => {
      ended.push(variables);
      return answer({ status: 'ended' });
    },
  });
  await openCreateTab(page);

  await page.getByTestId('create-title').fill('Rain before noon');
  await tap(page, 'create-side-a');
  await submit(page);
  await tap(page, 'create-close-betting');
  await expect(page.getByTestId('alert-title')).toHaveText('Close betting?');
  await tap(page, 'alert-button-close-betting');

  await expect(page.getByTestId('create-close-betting')).toContainText('Betting closed');
  expect(ended).toEqual([{ betId: sent[0].betId }]);
});

// ---------------------------------------------------------------------------
// Pools and challenges
// ---------------------------------------------------------------------------

test('a pool sends its options and the one the creator backs', async ({ page }) => {
  await signInAs(page);
  const { sent } = await recordCreates(page);
  await openCreateTab(page);

  await tap(page, 'create-format-pool');
  await page.getByTestId('create-title').fill('Who wins the Super Bowl?');
  await page.getByTestId('create-option-a-name').fill('Chiefs');
  await page.getByTestId('create-option-b-name').fill('Bills');
  await page.getByTestId('create-option-c-name').fill('Eagles');
  await expect(page.getByTestId('create-submit')).toHaveAttribute('aria-disabled', 'true');
  await tap(page, 'create-option-c');
  await expect(page.getByTestId('create-submit')).toContainText('Create · $5 on Eagles');
  await submit(page);

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
  expect(sent[0]).toMatchObject({
    side: 'C',
    sideAName: 'Chiefs',
    sideBName: 'Bills',
    options: ['Chiefs', 'Bills', 'Eagles'],
  });
  expect(sent[0]).not.toHaveProperty('maxParticipants');
});

test('a pool takes a fourth option, and removing one keeps the pick on its option', async ({ page }) => {
  await signInAs(page);
  const { sent } = await recordCreates(page);
  await openCreateTab(page);

  await tap(page, 'create-format-pool');
  await page.getByTestId('create-title').fill('Who wins the Super Bowl?');
  // Three options cannot lose one; a fourth can be added and then any removed
  await expect(page.getByTestId('create-option-a-remove')).toBeHidden();
  await tap(page, 'create-option-add');
  for (const [key, name] of [['a', 'Chiefs'], ['b', 'Bills'], ['c', 'Eagles'], ['d', 'Lions']]) {
    await page.getByTestId(`create-option-${key}-name`).fill(name);
  }
  await tap(page, 'create-option-d');
  await tap(page, 'create-option-b-remove');
  await submit(page);

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
  // Lions was D and is now C: the pick followed it
  expect(sent[0]).toMatchObject({ side: 'C', options: ['Chiefs', 'Eagles', 'Lions'] });
});

test('a pool refuses two options with one name before asking the server', async ({ page }) => {
  await signInAs(page);
  const { calls } = await mockAppSync(page, baseHandlers());
  await openCreateTab(page);

  await tap(page, 'create-format-pool');
  await page.getByTestId('create-title').fill('Who wins the Super Bowl?');
  await page.getByTestId('create-option-a-name').fill('Chiefs');
  await page.getByTestId('create-option-b-name').fill('Bills');
  await page.getByTestId('create-option-c-name').fill('chiefs');
  await tap(page, 'create-option-a');
  await submit(page);

  await expect(page.getByTestId('alert-title')).toHaveText('Duplicate Option');
  expect(calls).not.toContain('createBetWithStake');
});

test('a challenge is capped at two people, and ⇄ swaps your side', async ({ page }) => {
  await signInAs(page);
  const { sent } = await recordCreates(page);
  await openCreateTab(page);

  await tap(page, 'create-format-challenge');
  await page.getByTestId('create-title').fill('Saturday golf round');
  // You start on the first side; swap to the second
  await tap(page, 'create-challenge-swap');
  await expect(page.getByTestId('create-challenge-mine')).toContainText('No');
  await submit(page);

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
  expect(sent[0]).toMatchObject({ side: 'B', maxParticipants: 2, isPrivate: false });
  expect(sent[0]).not.toHaveProperty('options');
});

test('challenging a friend invites only them, to the other side, and keeps it to them', async ({ page }) => {
  await signInAs(page);
  const { sent, invitations } = await recordCreates(page, { friendshipsByUser1: list([friendship]) });
  await openCreateTab(page);

  await tap(page, 'create-format-challenge');
  await page.getByTestId('create-title').fill('Saturday golf round');
  await tap(page, `create-opponent-${OTHER_USER.id}`);
  await expect(page.getByTestId('create-submit')).toContainText('Challenge Casey · $5');
  await submit(page);

  await expect.poll(() => invitations.length, { timeout: 15_000 }).toBe(1);
  expect(sent[0]).toMatchObject({ side: 'A', maxParticipants: 2, isPrivate: true });
  expect(invitations[0]).toMatchObject({ betId: sent[0].betId, toUserId: OTHER_USER.id, invitedSide: 'B' });
});

// ---------------------------------------------------------------------------
// At a game
// ---------------------------------------------------------------------------

test('at a live game the screen opens on it, with the teams as the sides', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers(atTheGame()));
  await openCreateTab(page);

  await expect(page.getByTestId('create-game-header')).toContainText('Bills');
  await expect(page.getByTestId('create-game-header')).toContainText('10 – 14');
  await expect(page.getByTestId('create-game-header')).toContainText('Q3 · 4:12');
  await expect(page.getByTestId('create-side-a')).toContainText('Bills');
  await expect(page.getByTestId('create-side-b')).toContainText('Chiefs');
  await expect(page.getByTestId('create-close-time')).toContainText('15 min');
});

test('a suggestion fills the question and sides, and the bet is tagged to the game', async ({ page }) => {
  await signInAs(page);
  const { sent } = await recordCreates(page, atTheGame());
  await openCreateTab(page);

  await tap(page, 'create-suggestion-drive');
  await expect(page.getByTestId('create-title')).toHaveValue('Points on this drive?');
  await expect(page.getByTestId('create-side-a')).toContainText('Yes');
  await tap(page, 'create-side-a');
  await submit(page);

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
  expect(sent[0]).toMatchObject({
    title: 'Points on this drive?',
    description: 'Bills @ Chiefs',
    category: 'SPORTS',
    eventId: EVENT_ID,
    sideAName: 'Yes',
    sideBName: 'No',
    deadlineMinutes: 15,
  });
});

test('Next score switches to a pool with the scoring options filled in', async ({ page }) => {
  await signInAs(page);
  const { sent } = await recordCreates(page, atTheGame());
  await openCreateTab(page);

  await tap(page, 'create-suggestion-next-score');
  await expect(page.getByTestId('create-option-e')).toContainText('No score');
  await tap(page, 'create-option-c');
  await submit(page);

  await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
  expect(sent[0]).toMatchObject({
    side: 'C',
    options: ['Bills TD', 'Bills FG', 'Chiefs TD', 'Chiefs FG', 'No score'],
  });
});

test('tapping the selected suggestion again clears it, back to the teams', async ({ page }) => {
  await signInAs(page);
  await mockAppSync(page, baseHandlers(atTheGame()));
  await openCreateTab(page);

  await tap(page, 'create-suggestion-next-score');
  await expect(page.getByTestId('create-option-e')).toContainText('No score');
  await tap(page, 'create-suggestion-next-score');

  await expect(page.getByTestId('create-title')).toHaveValue('');
  await expect(page.getByTestId('create-option-a')).toBeHidden();
  await expect(page.getByTestId('create-side-a')).toContainText('Bills');
  await expect(page.getByTestId('create-side-b')).toContainText('Chiefs');
});

test('friends at the same game start invited, and the sent panel names them', async ({ page }) => {
  await signInAs(page);
  const { sent, invitations } = await recordCreates(page, atTheGame());
  await openCreateTab(page);

  // Casey is checked in to the same game, so starts invited without a tap
  await expect(page.getByTestId(`create-friend-${OTHER_USER.id}`)).toHaveAttribute('aria-label', 'Casey Friend, at the game', { timeout: 15_000 });
  await page.getByTestId('create-title').fill('Bills answer back');
  await tap(page, 'create-side-a');
  await expect(page.getByTestId('create-submit-detail')).toContainText('invites 1 at the game');
  await submit(page);

  await expect(page.getByTestId('create-sent')).toContainText('Casey was notified', { timeout: 15_000 });
  expect(invitations).toHaveLength(1);
  expect(invitations[0]).toMatchObject({ betId: sent[0].betId, toUserId: OTHER_USER.id, invitedSide: '' });
});
