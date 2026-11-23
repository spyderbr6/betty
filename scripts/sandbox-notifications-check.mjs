/**
 * Sandbox check that every server-raised notification is written, to the right person,
 * with the fields the app needs to show it and route a tap. It drives the real Lambdas
 * over throwaway rows, as sandbox-money-flows-check.mjs does, then reads each recipient's
 * notifications:
 *
 *   - the type, and the category the catalog files it under (the feed filters on it)
 *   - expiresAt in the future (DynamoDB TTL deletes the row after it)
 *   - where a tap goes: relatedBetId for bets, actionData.squaresGameId for squares
 *   - that it was written once, where the code that raises it can run twice
 *
 * Covered: BET_JOINED, BET_RESOLVED (at resolution and at payout), BET_CANCELLED,
 * BET_RESOLUTION_NEEDED, BET_DISPUTED, SQUARES_PURCHASE_CONFIRMED, SQUARES_GRID_LOCKED,
 * SQUARES_GAME_LIVE, SQUARES_PERIOD_WINNER, SQUARES_GAME_CANCELLED,
 * SQUARES_INVITATION_REMINDER, DEPOSIT_COMPLETED, DEPOSIT_FAILED, WITHDRAWAL_COMPLETED,
 * WITHDRAWAL_FAILED. Also that AppSync refuses a second create with a fixed id in the shape
 * notificationIds.isDuplicate expects.
 *
 * Not covered: the Stripe webhook's notices (a delivery needs Stripe's signature; their
 * logic is unit tested in stripe-webhook/__tests__) and the notifications the app raises
 * (friend requests, invitations: e2e). Whether a push then arrives is a device check
 * (docs/NOTIFICATIONS_PLAN.md §5).
 *
 * The Lambdas act on ALL sandbox data when invoked, exactly as their schedules do.
 *
 * Run against the sandbox ONLY:
 *   SANDBOX_STACK=amplify-sidebet-Desktop-sandbox-a3098e7c95 node scripts/sandbox-notifications-check.mjs
 * Refuses unless amplify_outputs.json points at that stack's API, and invokes only functions
 * that are resources of that stack.
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { CloudFormationClient, DescribeStackResourcesCommand, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
const endpoint = outputs.data.url;
const region = outputs.data.aws_region;

// --- guard: the endpoint must be the named sandbox's ------------------------------------
const stackName = process.env.SANDBOX_STACK;
if (!stackName || !stackName.includes('-sandbox-')) {
  console.error('Set SANDBOX_STACK to your sandbox stack name (it must contain "-sandbox-").');
  process.exit(1);
}
const { Stacks } = await new CloudFormationClient({ region }).send(new DescribeStacksCommand({ StackName: stackName }));
const apiId = new URL(endpoint).hostname.split('.')[0];
if (!JSON.stringify(Stacks[0].Outputs ?? []).includes(apiId)) {
  console.error(`Refusing: ${endpoint} is not an output of ${stackName}.`);
  process.exit(1);
}
console.log(`Sandbox ${stackName}: ${endpoint}\n`);

// --- the sandbox's functions -------------------------------------------------------------
const FUNCTIONS = ['scheduledbetchecker', 'payoutprocessor', 'scheduledsquareschecker', 'money'];
const cfn = new CloudFormationClient({ region });
const lambda = new LambdaClient({ region });
const functions = {};
const stacks = [stackName];
while (stacks.length) {
  const { StackResources = [] } = await cfn.send(new DescribeStackResourcesCommand({ StackName: stacks.pop() }));
  for (const r of StackResources) {
    if (r.ResourceType === 'AWS::CloudFormation::Stack' && r.PhysicalResourceId) stacks.push(r.PhysicalResourceId);
    if (r.ResourceType !== 'AWS::Lambda::Function' || !r.PhysicalResourceId) continue;
    for (const key of FUNCTIONS) {
      if (r.LogicalResourceId.toLowerCase().replace(/[^a-z]/g, '').includes(key)) functions[key] = r.PhysicalResourceId;
    }
  }
}
for (const key of FUNCTIONS) {
  if (!functions[key]) {
    console.error(`Could not find the ${key} function in ${stackName}.`);
    process.exit(1);
  }
}

async function invoke(key) {
  const result = await lambda.send(new InvokeCommand({ FunctionName: functions[key], Payload: Buffer.from('{}') }));
  const payload = Buffer.from(result.Payload ?? []).toString();
  if (result.FunctionError) throw new Error(`${key} failed: ${payload}`);
  return payload;
}

/** A money mutation as a signed-in app user (see sandbox-money-flows-check.mjs asUser). */
async function asUser(userId, fieldName, args, groups = null) {
  const event = {
    typeName: 'Mutation',
    fieldName,
    arguments: args,
    identity: { sub: userId, username: userId, claims: { sub: userId }, groups },
    source: null,
    request: { headers: {} },
    prev: null,
  };
  const result = await lambda.send(new InvokeCommand({ FunctionName: functions.money, Payload: Buffer.from(JSON.stringify(event)) }));
  const payload = Buffer.from(result.Payload ?? []).toString();
  if (result.FunctionError) throw new Error(`${fieldName} failed: ${payload}`);
  return JSON.parse(payload);
}

// --- signed GraphQL ---------------------------------------------------------------------
const signer = new SignatureV4({ credentials: defaultProvider(), region, service: 'appsync', sha256: Sha256 });

async function gqlRaw(query, variables) {
  const url = new URL(endpoint);
  const request = new HttpRequest({
    method: 'POST',
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    headers: { 'content-type': 'application/json', host: url.hostname },
    body: JSON.stringify({ query, variables }),
  });
  const signed = await signer.sign(request);
  const response = await fetch(endpoint, { method: 'POST', headers: signed.headers, body: signed.body });
  return response.json();
}

async function gql(query, variables) {
  const json = await gqlRaw(query, variables);
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const cap = (model) => model[0].toUpperCase() + model.slice(1);
const created = []; // [model, id], deleted in reverse at the end
const ledgerIds = [];

async function create(model, input) {
  const data = await gql(`mutation ($input: Create${cap(model)}Input!) { create${cap(model)}(input: $input) { id } }`, { input });
  created.push([model, data[`create${cap(model)}`].id]);
  return data[`create${cap(model)}`].id;
}

const get = async (model, id, fields) =>
  (await gql(`query ($id: ID!) { get${cap(model)}(id: $id) { ${fields} } }`, { id }))[`get${cap(model)}`];

let failures = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail && !pass ? `  (${detail})` : ''}`);
  if (!pass) failures++;
};

// --- fixtures ---------------------------------------------------------------------------
const run = `zz-notif-${Date.now()}`;
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const minutesAhead = (m) => new Date(Date.now() + m * 60_000).toISOString();
const users = [];

async function user(tag) {
  const id = `${run}-${tag}`;
  await create('user', { id, username: id, displayName: tag, email: `${id}@example.invalid`, balance: 0, trustScore: 5 });
  users.push(id);
  return id;
}

async function credit(userId, amount) {
  const id = `zz-notif-credit#${userId}#${Date.now()}`;
  ledgerIds.push(id);
  await gql('mutation ($e: AWSJSON!) { ledgerApply(entries: $e) }', {
    e: JSON.stringify([{ transactionId: id, userId, type: 'ADMIN_ADJUSTMENT', delta: amount, amount: Math.abs(amount), status: 'COMPLETED', mode: 'create', notes: run }]),
  });
}

const bet = (tag, fields) =>
  create('bet', {
    id: `${run}-${tag}`, title: `${run} ${tag}`, description: 'sandbox-notifications-check', category: 'CUSTOM',
    betAmount: 5, totalPot: 0, odds: JSON.stringify({ sideAName: 'Yes', sideBName: 'No' }), isPrivate: true, isTestBet: true,
    ...fields,
  });

const participant = (betId, userId, side, amount) =>
  create('participant', { betId, userId, side, amount, status: 'ACCEPTED', payout: 0, joinedAt: new Date().toISOString() });

const payoutStructure = JSON.stringify({ period1: 0.25, period2: 0.25, period3: 0.25, period4: 0.25 });
const squaresGame = (tag, fields) =>
  create('squaresGame', {
    id: `${run}-${tag}`, title: `${run} ${tag}`, creatorId: fields.creatorId, pricePerSquare: 2, totalPot: 0,
    squaresSold: 0, status: 'ACTIVE', numbersAssigned: false, isPrivate: true, payoutStructure, ...fields,
  });

const purchase = (squaresGameId, userId, gridRow, gridCol, amount = 2) =>
  create('squaresPurchase', { squaresGameId, userId, ownerName: userId, gridRow, gridCol, amount, purchasedAt: new Date().toISOString() });

/** A user's notifications, newest first. */
async function inbox(userId) {
  const data = await gql(
    'query ($u: ID!) { notificationsByUser(userId: $u, sortDirection: DESC, limit: 200) { items { id type category expiresAt title message actionData relatedBetId } } }',
    { u: userId }
  );
  return data.notificationsByUser.items;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const gameIdOf = (n) => {
  try {
    const data = typeof n.actionData === 'string' ? JSON.parse(n.actionData) : n.actionData;
    return data?.squaresGameId ?? null;
  } catch {
    return null;
  }
};

/**
 * Exactly `count` notifications of `type` for `userId` matching `about` (a bet id or a
 * squares game id), each with the category, a future expiry and something to route on.
 */
async function expectNotified(label, userId, type, category, about, { count = 1, where = () => true } = {}) {
  const found = (await inbox(userId)).filter((n) => n.type === type && (n.relatedBetId === about || gameIdOf(n) === about) && where(n));
  const ok =
    found.length === count &&
    found.every((n) => n.category === category && Number.isInteger(n.expiresAt) && n.expiresAt > nowSeconds());
  check(label, ok, `${found.length} found: ${JSON.stringify(found)}`);
  return found;
}

/** No notification of `type` about `about` for `userId`. */
async function expectNotNotified(label, userId, type, about) {
  const found = (await inbox(userId)).filter((n) => n.type === type && (n.relatedBetId === about || gameIdOf(n) === about));
  check(label, found.length === 0, JSON.stringify(found));
}

try {
  // 1. Expiry: nobody joined → cancelled; someone joined → the creator picks the winner ---
  {
    const alice = await user('alice');
    const bob = await user('bob');
    const lonely = await bet('expired-alone', { creatorId: alice, status: 'ACTIVE', deadline: hoursAgo(1) });
    const p = await participant(lonely, alice, 'A', 5);
    ledgerIds.push(`refund#${p}`);
    const taken = await bet('expired-taken', { creatorId: alice, status: 'ACTIVE', deadline: hoursAgo(1) });
    await participant(taken, alice, 'A', 5);
    await participant(taken, bob, 'B', 5);

    await Promise.all([invoke('scheduledbetchecker'), invoke('scheduledbetchecker')]);
    await invoke('scheduledbetchecker');

    await expectNotified('BET_CANCELLED: the creator of a bet nobody took', alice, 'BET_CANCELLED', 'REFUNDS', lonely);
    check('a bet somebody took waits for its winner', (await get('bet', taken, 'status')).status === 'PENDING_RESOLUTION');
    await expectNotified('BET_RESOLUTION_NEEDED: its creator, once, however many runs overlap', alice, 'BET_RESOLUTION_NEEDED', 'ACTION_NEEDED', taken);
    await expectNotNotified('BET_RESOLUTION_NEEDED: not the other participant', bob, 'BET_RESOLUTION_NEEDED', taken);

    // The duplicate guard relies on AppSync refusing a second row with the same id
    const again = await gqlRaw(
      'mutation ($i: CreateNotificationInput!) { createNotification(input: $i) { id } }',
      { i: { id: `resolution-needed#${taken}`, userId: alice, type: 'BET_RESOLUTION_NEEDED', title: 't', message: 'm' } }
    );
    const errs = again.errors ?? [];
    check(
      'a second create with the same id is refused as a conditional-write failure',
      errs.length > 0 && errs.every((e) => /ConditionalCheckFailed/i.test(e.errorType ?? '') || /conditional request failed/i.test(e.message ?? '')),
      JSON.stringify(errs)
    );
  }

  // 2. Joining, resolving, disputing, paying out (money function, payout processor) -------
  {
    const creator = await user('creator');
    const taker = await user('taker');
    await credit(creator, 5);
    await credit(taker, 5);
    const betId = randomUUID();
    for (const uid of [creator, taker]) {
      created.push(['participant', `${betId}#${uid}`]);
      ledgerIds.push(`stake#${betId}#${uid}`, `payout#${betId}#${uid}`, `loss#${betId}#${uid}`);
    }
    created.push(['bet', betId]);
    const form = { betId, title: `${run} money`, description: 'sandbox-notifications-check', category: 'CUSTOM', amount: 5, side: 'A', sideAName: 'Yes', sideBName: 'No', deadlineMinutes: 30, isPrivate: false };
    const made = await asUser(creator, 'createBetWithStake', form);
    const joined = await asUser(taker, 'joinBet', { betId, side: 'B', amount: 5 });
    check('setup: bet created and joined', made.status === 'created' && joined.status === 'joined', JSON.stringify([made, joined]));
    await expectNotified('BET_JOINED: the creator', creator, 'BET_JOINED', 'MY_BET_ACTIVITY', betId);

    const resolved = await asUser(creator, 'resolveBet', { betId, winningSide: 'A' });
    check('setup: resolved', resolved.status === 'resolved', JSON.stringify(resolved));
    // The creator picked the winner, so only the other participants are told at resolution
    await expectNotNotified('BET_RESOLVED: not the creator who resolved it', creator, 'BET_RESOLVED', betId);
    await expectNotified('BET_RESOLVED: the other participant, at resolution', taker, 'BET_RESOLVED', 'RESULTS', betId);

    const filed = await asUser(taker, 'fileDispute', { betId, reason: 'INCORRECT_RESOLUTION', description: run, evidenceUrls: [] });
    if (filed.disputeId) created.push(['dispute', filed.disputeId]);
    check('setup: dispute filed', filed.status === 'filed', JSON.stringify(filed));
    await expectNotified('BET_DISPUTED: the creator', creator, 'BET_DISPUTED', 'ACTION_NEEDED', betId, { where: (n) => n.title === 'Bet Disputed' });

    // Dismiss it, close the window, and let the payout processor pay the winner
    if (filed.disputeId) await asUser(`${run}-admin`, 'adminResolveDispute', { disputeId: filed.disputeId, outcome: 'DISMISSED' }, ['admins']);
    await gql('mutation ($i: UpdateBetInput!) { updateBet(input: $i) { id } }', { i: { id: betId, disputeWindowEndsAt: hoursAgo(0.1) } });
    await invoke('payoutprocessor');
    await expectNotified('BET_RESOLVED: the winner again when paid', creator, 'BET_RESOLVED', 'RESULTS', betId, { where: (n) => n.title === 'Bet Won!' });
    const history = await gql('query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }', { f: { relatedBetId: { eq: betId } } });
    for (const h of history.listTrustScoreHistories.items) created.push(['trustScoreHistory', h.id]);
  }

  // 3. Squares: buying, locking, going live, a period won, a game cancelled ---------------
  {
    const host = await user('sq-host');
    const buyer = await user('sq-buyer');
    await credit(buyer, 10);
    const event = await create('liveEvent', {
      id: `${run}-event`, externalId: `${run}-event`, sport: 'NFL', homeTeam: 'H', awayTeam: 'A', scheduledTime: hoursAgo(0.5), status: 'LIVE',
    });

    // Bought through the server, then cancelled by its creator
    const open = await squaresGame('sq-open', { creatorId: host, eventId: event, locksAt: minutesAhead(24 * 60) });
    created.push(['squaresPurchase', `${open}#1-1`]);
    ledgerIds.push(`squares-buy#${open}#${buyer}#11`, `squares-refund#${open}#${buyer}`);
    const bought = await asUser(buyer, 'buySquares', { squaresGameId: open, ownerName: 'Buyer', squares: JSON.stringify([{ row: 1, col: 1 }]) });
    check('setup: squares bought', bought.status === 'bought', JSON.stringify(bought));
    await expectNotified('SQUARES_PURCHASE_CONFIRMED: the buyer', buyer, 'SQUARES_PURCHASE_CONFIRMED', 'SQUARES_UPDATES', open);
    const cancelled = await asUser(host, 'cancelSquaresGame', { squaresGameId: open, reason: null });
    check('setup: game cancelled', cancelled.status === 'cancelled', JSON.stringify(cancelled));
    await expectNotified('SQUARES_GAME_CANCELLED: the buyer', buyer, 'SQUARES_GAME_CANCELLED', 'REFUNDS', open);

    // Past its lock time with its event live: locked, then started, in one run
    const due = await squaresGame('sq-due', { creatorId: host, eventId: event, locksAt: hoursAgo(0.1), squaresSold: 1, totalPot: 2 });
    await purchase(due, buyer, 2, 2);
    // A LIVE game with fixed numbers: home 17, away 23 wins the square at row 7, column 3
    const scored = await create('liveEvent', {
      id: `${run}-scored`, externalId: `${run}-scored`, sport: 'NFL', homeTeam: 'H', awayTeam: 'A', scheduledTime: hoursAgo(1), status: 'LIVE',
      homePeriodScores: JSON.stringify([17]), awayPeriodScores: JSON.stringify([23]),
    });
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const live = await squaresGame('sq-live', {
      creatorId: host, eventId: scored, status: 'LIVE', locksAt: hoursAgo(0.5), squaresSold: 1, totalPot: 4, pricePerSquare: 4,
      numbersAssigned: true, rowNumbers: digits, colNumbers: digits,
    });
    await purchase(live, buyer, 7, 3, 4);
    ledgerIds.push(`squares-payout#${live}#PERIOD_1`);
    created.push(['squaresPayout', `${live}#PERIOD_1`]);

    await invoke('scheduledsquareschecker');
    await expectNotified('SQUARES_GRID_LOCKED: the buyer', buyer, 'SQUARES_GRID_LOCKED', 'SQUARES_UPDATES', due);
    await expectNotified('SQUARES_GAME_LIVE: the buyer', buyer, 'SQUARES_GAME_LIVE', 'REMINDERS', due);
    await expectNotified('SQUARES_PERIOD_WINNER: the square that won', buyer, 'SQUARES_PERIOD_WINNER', 'RESULTS', live);
  }

  // 4. A squares invitation still unanswered shortly before the grid locks ----------------
  {
    const host = await user('rem-host');
    const [waiting, boughtAlready, declined, later] = [await user('rem-waiting'), await user('rem-bought'), await user('rem-declined'), await user('rem-later')];
    const soon = await squaresGame('rem-soon', { creatorId: host, eventId: `${run}-no-event`, locksAt: minutesAhead(30), squaresSold: 1, totalPot: 2 });
    const notYet = await squaresGame('rem-not-yet', { creatorId: host, eventId: `${run}-no-event`, locksAt: minutesAhead(180) });
    await purchase(soon, boughtAlready, 0, 0);
    const invite = (squaresGameId, toUserId, status = 'PENDING') =>
      create('squaresInvitation', { squaresGameId, fromUserId: host, toUserId, status, createdAt: new Date().toISOString() });
    for (const [uid, status] of [[waiting, 'PENDING'], [boughtAlready, 'PENDING'], [declined, 'DECLINED'], [host, 'PENDING']]) await invite(soon, uid, status);
    await invite(notYet, later);

    await Promise.all([invoke('scheduledsquareschecker'), invoke('scheduledsquareschecker')]);
    await invoke('scheduledsquareschecker');

    const [reminder] = await expectNotified('SQUARES_INVITATION_REMINDER: an invitee who has not answered, once', waiting, 'SQUARES_INVITATION_REMINDER', 'REMINDERS', soon);
    check('the reminder says how long is left', /locks in \d+ minutes/.test(reminder?.message ?? ''), reminder?.message);
    await expectNotNotified('SQUARES_INVITATION_REMINDER: not an invitee who already bought', boughtAlready, 'SQUARES_INVITATION_REMINDER', soon);
    await expectNotNotified('SQUARES_INVITATION_REMINDER: not an invitee who declined', declined, 'SQUARES_INVITATION_REMINDER', soon);
    await expectNotNotified('SQUARES_INVITATION_REMINDER: not the creator', host, 'SQUARES_INVITATION_REMINDER', soon);
    await expectNotNotified('SQUARES_INVITATION_REMINDER: not for a game locking in three hours', later, 'SQUARES_INVITATION_REMINDER', notYet);
  }

  // 5. Deposits and withdrawals decided by an admin ----------------------------------------
  {
    const wal = await user('wal');
    await credit(wal, 100);
    const asAdmin = (field, args) => asUser(`${run}-admin`, field, args, ['admins']);
    const method = await create('paymentMethod', { userId: wal, type: 'VENMO', venmoUsername: 'wal-venmo', displayName: 'Wal Venmo', isVerified: false, isActive: true, isDefault: true });
    const trustRows = async (transactionId) => {
      const r = await gql('query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }', { f: { relatedTransactionId: { eq: transactionId } } });
      for (const h of r.listTrustScoreHistories.items) created.push(['trustScoreHistory', h.id]);
    };
    const decided = async (transactionId, approve) => {
      const result = await asAdmin('adminDecideTransaction', { transactionId, approve, reason: approve ? undefined : 'sandbox check' });
      await trustRows(transactionId);
      return result;
    };
    // Money notices carry no bet or game id: matched on the user and title alone
    const moneyNotice = async (label, type, title) => {
      const found = (await inbox(wal)).filter((n) => n.type === type && n.title === title);
      check(label, found.length === 1 && found[0].category === 'MONEY' && found[0].expiresAt > nowSeconds(), JSON.stringify(found));
    };

    const w1 = randomUUID();
    const w2 = randomUUID();
    ledgerIds.push(`withdrawal#${w1}`, `withdrawal#${w2}`);
    await asUser(wal, 'requestWithdrawal', { requestId: w1, amount: 10, paymentMethodId: method });
    await asUser(wal, 'requestWithdrawal', { requestId: w2, amount: 10, paymentMethodId: method });
    await decided(`withdrawal#${w1}`, true);
    await decided(`withdrawal#${w2}`, false);
    await moneyNotice('WITHDRAWAL_COMPLETED: the user, when approved', 'WITHDRAWAL_COMPLETED', 'Withdrawal Complete');
    await moneyNotice('WITHDRAWAL_FAILED: the user, when rejected', 'WITHDRAWAL_FAILED', 'Withdrawal Failed');

    const d1 = await create('transaction', { userId: wal, type: 'DEPOSIT', status: 'PENDING', amount: 25, balanceBefore: 80, balanceAfter: 105, createdAt: new Date().toISOString() });
    const d2 = await create('transaction', { userId: wal, type: 'DEPOSIT', status: 'PENDING', amount: 25, balanceBefore: 80, balanceAfter: 105, createdAt: new Date().toISOString() });
    await decided(d1, true);
    await decided(d2, false);
    await moneyNotice('DEPOSIT_COMPLETED: the user, when approved', 'DEPOSIT_COMPLETED', 'Deposit Successful');
    await moneyNotice('DEPOSIT_FAILED: the user, when rejected', 'DEPOSIT_FAILED', 'Deposit Failed');
  }
} catch (error) {
  console.error('ERROR', error.message ?? error);
  failures++;
} finally {
  // The test users' notifications, then ledger rows, then everything created, newest first
  let notes = 0;
  for (const uid of users) {
    for (const n of await inbox(uid).catch(() => [])) {
      await gql('mutation ($i: DeleteNotificationInput!) { deleteNotification(input: $i) { id } }', { i: { id: n.id } }).catch(() => {});
      notes++;
    }
  }
  for (const id of ledgerIds) created.push(['transaction', id]);
  for (const [model, id] of created.reverse()) {
    await gql(`mutation ($input: Delete${cap(model)}Input!) { delete${cap(model)}(input: $input) { id } }`, { input: { id } }).catch(() => {});
  }
  console.log(`\nCleaned up ${created.length} rows and ${notes} notifications.`);
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
