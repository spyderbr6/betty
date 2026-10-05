/**
 * Sandbox check for the Lambdas that move money through the ledger (docs/SECURITY_PLAN.md
 * step 2). Where sandbox-money-check.mjs tests the ledger alone, this drives the real
 * scheduled Lambdas over throwaway rows and checks what they did to balances and records:
 *
 *   1. scheduled-bet-checker: an expired bet nobody joined is cancelled and the stake
 *      returned, once, in the same write
 *   2. payout-processor: a resolved bet is paid from the stakes (server-side fee), an old
 *      client-written payout row is cancelled unpaid, and two overlapping runs pay once
 *      and reward the creator once
 *   3. payout-processor: a resolution overturned by an upheld dispute is not paid
 *   4. scheduled-squares-checker: a LOCKED game whose event is gone refunds every buyer
 *   5. scheduled-squares-checker: a period winner is paid from the purchases (not the
 *      totalPot field), once, with one payout record
 *   6. money (joinBet): a join writes the participant, the stake and the bet's counts
 *      together; second joins, short balances, wrong stakes, private bets without an
 *      invitation and bets past their deadline are refused with nothing written;
 *      simultaneous joins all count; callers that are not app users are refused
 *
 * The Lambdas act on ALL sandbox data when invoked, exactly as their schedules do.
 *
 * Run against the sandbox ONLY:
 *   SANDBOX_STACK=amplify-sidebet-Desktop-sandbox-a3098e7c95 node scripts/sandbox-money-flows-check.mjs
 * Refuses unless amplify_outputs.json points at that stack's API, and invokes only functions
 * that are resources of that stack.
 */

import { readFileSync } from 'node:fs';
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

// --- the sandbox's functions: Lambda resources inside the sandbox stack's nested stacks --
const cfn = new CloudFormationClient({ region });
const lambda = new LambdaClient({ region });
const functions = {};
const stacks = [stackName];
while (stacks.length) {
  const { StackResources = [] } = await cfn.send(new DescribeStackResourcesCommand({ StackName: stacks.pop() }));
  for (const r of StackResources) {
    if (r.ResourceType === 'AWS::CloudFormation::Stack' && r.PhysicalResourceId) stacks.push(r.PhysicalResourceId);
    if (r.ResourceType !== 'AWS::Lambda::Function' || !r.PhysicalResourceId) continue;
    for (const key of ['scheduledbetchecker', 'payoutprocessor', 'scheduledsquareschecker', 'money']) {
      if (r.LogicalResourceId.toLowerCase().replace(/[^a-z]/g, '').includes(key)) functions[key] = r.PhysicalResourceId;
    }
  }
}
for (const key of ['scheduledbetchecker', 'payoutprocessor', 'scheduledsquareschecker', 'money']) {
  if (!functions[key]) {
    console.error(`Could not find the ${key} function in ${stackName}.`);
    process.exit(1);
  }
}
console.log('Functions:', Object.values(functions).join(', '), '\n');

async function invoke(key) {
  const result = await lambda.send(new InvokeCommand({ FunctionName: functions[key], Payload: Buffer.from('{}') }));
  const payload = Buffer.from(result.Payload ?? []).toString();
  if (result.FunctionError) throw new Error(`${key} failed: ${payload}`);
  return payload;
}

/**
 * joinBet as an app user. Creating and signing in a Cognito user is out of reach of the
 * local profile, so this invokes the money function with the event AppSync would send for
 * a signed-in user (Amplify's resolver payload with a user-pool identity): the handler,
 * the ledger and the tables are the real ones; only AppSync's sign-in check is skipped.
 */
async function joinAs(userId, betId, side, amount) {
  const event = {
    typeName: 'Mutation',
    fieldName: 'joinBet',
    arguments: { betId, side, amount },
    identity: { sub: userId, username: userId, claims: { sub: userId }, groups: null },
    source: null,
    request: { headers: {} },
    prev: null,
  };
  const result = await lambda.send(new InvokeCommand({ FunctionName: functions.money, Payload: Buffer.from(JSON.stringify(event)) }));
  const payload = Buffer.from(result.Payload ?? []).toString();
  if (result.FunctionError) throw new Error(`joinBet failed: ${payload}`);
  return JSON.parse(payload);
}

// --- signed GraphQL ---------------------------------------------------------------------
const signer = new SignatureV4({ credentials: defaultProvider(), region, service: 'appsync', sha256: Sha256 });

async function gql(query, variables) {
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
  const json = await response.json();
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const cap = (model) => model[0].toUpperCase() + model.slice(1);
const created = []; // [model, id], deleted in reverse at the end

async function create(model, input) {
  const data = await gql(`mutation ($input: Create${cap(model)}Input!) { create${cap(model)}(input: $input) { id } }`, { input });
  created.push([model, data[`create${cap(model)}`].id]);
  return data[`create${cap(model)}`].id;
}

async function get(model, id, fields) {
  return (await gql(`query ($id: ID!) { get${cap(model)}(id: $id) { ${fields} } }`, { id }))[`get${cap(model)}`];
}

const balance = async (userId) => (await get('user', userId, 'balance')).balance ?? 0;
/** Money compared in cents, so float rounding cannot fail a check. */
const same = (a, b) => Math.round(a * 100) === Math.round(b * 100);

let failures = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!pass) failures++;
};

// --- fixtures ---------------------------------------------------------------------------
const run = `zz-flow-${Date.now()}`;
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const ledgerIds = [];

async function user(tag) {
  const id = `${run}-${tag}`;
  await create('user', { id, username: id, email: `${id}@example.invalid`, balance: 0, trustScore: 5 });
  return id;
}

async function bet(tag, fields) {
  return create('bet', {
    id: `${run}-${tag}`,
    title: `${run} ${tag}`,
    description: 'sandbox-money-flows-check',
    category: 'CUSTOM',
    betAmount: 5,
    totalPot: 0,
    odds: JSON.stringify({ sideAName: 'Yes', sideBName: 'No' }),
    isPrivate: true,
    isTestBet: true,
    ...fields,
  });
}

const participant = (betId, userId, side, amount) =>
  create('participant', { betId, userId, side, amount, status: 'ACCEPTED', payout: 0, joinedAt: new Date().toISOString() });

try {
  const alice = await user('alice');
  const bob = await user('bob');

  // 1. Expired bet, creator only: cancelled and refunded, once -------------------------
  {
    const betId = await bet('expired', { creatorId: alice, status: 'ACTIVE', deadline: hoursAgo(1) });
    const p = await participant(betId, alice, 'A', 5);
    ledgerIds.push(`refund#${p}`);

    await invoke('scheduledbetchecker');
    const b = await get('bet', betId, 'status');
    const tx = await get('transaction', `refund#${p}`, 'status amount type');
    check('expired bet is cancelled', b.status === 'CANCELLED', b.status);
    check('its stake is returned through the ledger', same(await balance(alice), 5) && tx?.status === 'COMPLETED' && tx.amount === 5, JSON.stringify(tx));

    await invoke('scheduledbetchecker');
    check('a second run does not refund again', same(await balance(alice), 5));
  }

  // 2. Settlement: server-computed payout, stray row cancelled, overlapping runs pay once --
  {
    const before = await balance(alice);
    const betId = await bet('settle', {
      creatorId: alice,
      status: 'PENDING_RESOLUTION',
      winningSide: 'A',
      deadline: hoursAgo(50),
      disputeWindowEndsAt: hoursAgo(1),
    });
    const pa = await participant(betId, alice, 'A', 5);
    await participant(betId, bob, 'B', 5);
    ledgerIds.push(`payout#${pa}`);
    // What an old app version writes at resolution: a PENDING payout with a random id and
    // a client-computed amount. The server must not pay it.
    const stray = await create('transaction', {
      userId: bob, type: 'BET_WON', status: 'PENDING', amount: 999, actualAmount: 999,
      balanceBefore: 0, balanceAfter: 999, relatedBetId: betId, createdAt: new Date().toISOString(),
    });

    // Two payout runs at the same moment
    await Promise.all([invoke('payoutprocessor'), invoke('payoutprocessor')]);

    const b = await get('bet', betId, 'status');
    const payout = await get('transaction', `payout#${pa}`, 'status amount actualAmount platformFee');
    const strayRow = await get('transaction', stray, 'status');
    const history = await gql(
      'query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }',
      { f: { relatedBetId: { eq: betId } } }
    );
    for (const h of history.listTrustScoreHistories.items) created.push(['trustScoreHistory', h.id]);

    check('settled bet is RESOLVED', b.status === 'RESOLVED', b.status);
    check('winner paid the pot net of the 3% fee, once', same(await balance(alice), before + 9.7), `balance ${await balance(alice)}, row ${JSON.stringify(payout)}`);
    check('payout row records gross, net and fee', payout?.amount === 10 && payout.actualAmount === 9.7 && payout.platformFee === 0.3);
    check('loser credited nothing; the stray client row is not paid', same(await balance(bob), 0) && strayRow.status === 'CANCELLED', `bob ${await balance(bob)}, stray ${strayRow.status}`);
    check('overlapping runs reward the creator once', history.listTrustScoreHistories.items.length === 1, `${history.listTrustScoreHistories.items.length} rewards`);
  }

  // 3. A resolution overturned by an upheld dispute is not paid ---------------------------
  {
    const betId = await bet('overturned', {
      creatorId: alice,
      status: 'PENDING_RESOLUTION',
      winningSide: 'A',
      deadline: hoursAgo(60),
      disputeWindowEndsAt: hoursAgo(1), // resolved 49h ago
    });
    const pa = await participant(betId, alice, 'A', 5);
    await participant(betId, bob, 'B', 5);
    ledgerIds.push(`payout#${pa}`);
    await create('dispute', {
      betId, filedBy: bob, againstUserId: alice, reason: 'INCORRECT_RESOLUTION', description: run,
      status: 'RESOLVED_FOR_FILER', resolvedAt: hoursAgo(10),
    });
    const before = await balance(alice);

    await invoke('payoutprocessor');
    const b = await get('bet', betId, 'status');
    check('overturned result is not paid', b.status === 'PENDING_RESOLUTION' && same(await balance(alice), before) && !(await get('transaction', `payout#${pa}`, 'id')), b.status);
  }

  // 4. LOCKED squares game whose event is gone: every buyer refunded ----------------------
  {
    const gameId = await create('squaresGame', {
      id: `${run}-sq-cancel`, title: `${run} sq-cancel`, eventId: `${run}-no-such-event`, creatorId: alice,
      pricePerSquare: 2, totalPot: 6, squaresSold: 3, status: 'LOCKED', locksAt: hoursAgo(1),
      payoutStructure: JSON.stringify({ period1: 0.25, period2: 0.25, period3: 0.25, period4: 0.25 }),
    });
    const now = new Date().toISOString();
    for (const [uid, row, col] of [[bob, 0, 0], [bob, 0, 1], [alice, 1, 1]]) {
      await create('squaresPurchase', { squaresGameId: gameId, userId: uid, ownerName: uid, gridRow: row, gridCol: col, amount: 2, purchasedAt: now });
    }
    ledgerIds.push(`squares-refund#${gameId}#${bob}`, `squares-refund#${gameId}#${alice}`);
    const aliceBefore = await balance(alice);
    const bobBefore = await balance(bob);

    await invoke('scheduledsquareschecker');
    const g = await get('squaresGame', gameId, 'status');
    check('game with no event is cancelled', g.status === 'CANCELLED', g.status);
    check('each buyer gets back what they paid', same(await balance(bob), bobBefore + 4) && same(await balance(alice), aliceBefore + 2), `bob +${(await balance(bob)) - bobBefore}, alice +${(await balance(alice)) - aliceBefore}`);

    await invoke('scheduledsquareschecker');
    check('a second run does not refund again', same(await balance(bob), bobBefore + 4));
  }

  // 5. Squares period payout, from the purchases, once ------------------------------------
  {
    const eventId = await create('liveEvent', {
      id: `${run}-event`, externalId: `${run}-event`, sport: 'NFL', homeTeam: 'Home', awayTeam: 'Away',
      scheduledTime: hoursAgo(1), status: 'UPCOMING',
      homePeriodScores: JSON.stringify([17]), awayPeriodScores: JSON.stringify([23]),
    });
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const gameId = await create('squaresGame', {
      id: `${run}-sq-live`, title: `${run} sq-live`, eventId, creatorId: alice,
      pricePerSquare: 4, totalPot: 1000, // the field is wrong on purpose: the pot is 8
      squaresSold: 2, status: 'LIVE', locksAt: hoursAgo(0.2),
      numbersAssigned: true, rowNumbers: digits, colNumbers: digits,
      payoutStructure: JSON.stringify({ period1: 0.25, period2: 0.25, period3: 0.25, period4: 0.25 }),
    });
    const now = new Date().toISOString();
    // Home 17, away 23: row of 7, column of 3
    await create('squaresPurchase', { squaresGameId: gameId, userId: bob, ownerName: 'Bob', gridRow: 7, gridCol: 3, amount: 4, purchasedAt: now });
    await create('squaresPurchase', { squaresGameId: gameId, userId: alice, ownerName: 'Alice', gridRow: 0, gridCol: 0, amount: 4, purchasedAt: now });
    ledgerIds.push(`squares-payout#${gameId}#PERIOD_1`);
    created.push(['squaresPayout', `${gameId}#PERIOD_1`]);
    const bobBefore = await balance(bob);

    await Promise.all([invoke('scheduledsquareschecker'), invoke('scheduledsquareschecker')]);
    const tx = await get('transaction', `squares-payout#${gameId}#PERIOD_1`, 'amount actualAmount platformFee');
    const payouts = await gql(
      'query ($id: ID!) { payoutsBySquaresGame(squaresGameId: $id) { items { id period } } }',
      { id: gameId }
    );
    check('period winner paid 25% of the purchases, net of fee', same(await balance(bob), bobBefore + 1.94) && tx?.amount === 2 && tx.platformFee === 0.06, `bob +${((await balance(bob)) - bobBefore).toFixed(2)}, ${JSON.stringify(tx)}`);
    check('overlapping runs record the period once', payouts.payoutsBySquaresGame.items.length === 1, JSON.stringify(payouts.payoutsBySquaresGame.items));
  }

  // 6. Joining a bet through the server (joinBet) ------------------------------------------
  {
    const credit = async (userId, amount) => {
      const id = `zz-flow-credit#${userId}#${Date.now()}`;
      ledgerIds.push(id);
      const data = await gql('mutation ($e: AWSJSON!) { ledgerApply(entries: $e) }', {
        e: JSON.stringify([{ transactionId: id, userId, type: 'ADMIN_ADJUSTMENT', delta: amount, amount: Math.abs(amount), status: 'COMPLETED', mode: 'create', notes: run }]),
      });
      return JSON.parse(data.ledgerApply);
    };
    const open = (tag, fields = {}) =>
      bet(tag, {
        creatorId: alice, status: 'ACTIVE', deadline: new Date(Date.now() + 3600_000).toISOString(),
        betAmount: 5, totalPot: 5, sideACount: 1, sideBCount: 0, participantUserIds: [alice], isPrivate: false, ...fields,
      });
    const trackJoin = (betId, userId) => {
      created.push(['participant', `${betId}#${userId}`]);
      ledgerIds.push(`stake#${betId}#${userId}`);
    };

    const betId = await open('join');
    await participant(betId, alice, 'A', 5);
    const carol = await user('carol');
    const bobBefore = await balance(bob);
    await credit(bob, 7 - bobBefore); // bob holds exactly $7
    await credit(carol, 3);

    trackJoin(betId, bob);
    const joined = await joinAs(bob, betId, 'B', 5);
    const b = await get('bet', betId, 'totalPot sideACount sideBCount participantUserIds');
    const p = await get('participant', `${betId}#${bob}`, 'side amount status joinedAt');
    check('join takes the stake and returns the new balance', joined.status === 'joined' && same(joined.balance, 2) && same(await balance(bob), 2), JSON.stringify(joined));
    check('join writes the participant row', p?.side === 'B' && p.amount === 5 && p.status === 'ACCEPTED' && Boolean(p.joinedAt), JSON.stringify(p));
    check('join updates the counts, pot and list in the same write', b.sideBCount === 1 && b.sideACount === 1 && b.totalPot === 10 && b.participantUserIds.includes(bob), JSON.stringify(b));
    const listed = await gql('query ($id: ID!) { participantsByBet(betId: $id) { items { id } } }', { id: betId });
    check('the new participant is in the bet\'s participant index', listed.participantsByBet.items.some((i) => i.id === `${betId}#${bob}`));

    const again = await joinAs(bob, betId, 'A', 5);
    check('a second join is refused and charges nothing', again.reason === 'ALREADY_JOINED' && same(await balance(bob), 2), JSON.stringify(again));

    trackJoin(betId, carol);
    const poor = await joinAs(carol, betId, 'B', 5);
    check('a join the balance cannot cover is refused, with nothing written', poor.reason === 'INSUFFICIENT_FUNDS' && same(await balance(carol), 3) && !(await get('participant', `${betId}#${carol}`, 'id')), JSON.stringify(poor));

    const changed = await joinAs(carol, betId, 'B', 1);
    check('a join for a stake other than the bet\'s is refused', changed.reason === 'AMOUNT_CHANGED', JSON.stringify(changed));

    const privateId = await open('join-private', { isPrivate: true });
    const privateTry = await joinAs(carol, privateId, 'B', 5);
    check('a private bet needs an invitation', privateTry.reason === 'NOT_INVITED', JSON.stringify(privateTry));

    const expiredId = await open('join-expired', { deadline: hoursAgo(0.1) });
    const late = await joinAs(carol, expiredId, 'B', 5);
    check('a bet past its deadline cannot be joined, even while still ACTIVE', late.reason === 'EXPIRED', JSON.stringify(late));

    // Three people join one bet at the same moment: every count lands
    const rushId = await open('join-rush');
    const rushers = [await user('dave'), await user('erin'), await user('frank')];
    for (const r of rushers) { await credit(r, 5); trackJoin(rushId, r); }
    const rush = await Promise.all(rushers.map((r) => joinAs(r, rushId, 'B', 5)));
    const rb = await get('bet', rushId, 'totalPot sideBCount participantUserIds');
    check('simultaneous joins all count', rush.every((r) => r.status === 'joined') && rb.sideBCount === 3 && rb.totalPot === 20 && rb.participantUserIds.length === 4, `${rush.map((r) => r.status)} ${JSON.stringify(rb)}`);

    // Our own Lambdas (IAM) are not app users: joinBet through AppSync refuses them
    let refused = false;
    try {
      await gql('mutation ($b: ID!, $s: String!, $a: Float!) { joinBet(betId: $b, side: $s, amount: $a) }', { b: betId, s: 'B', a: 5 });
    } catch (error) {
      refused = String(error.message).includes('Unauthorized');
    }
    check('joinBet refuses callers that are not signed-in users', refused);
  }
} catch (error) {
  console.error('ERROR', error.message ?? error);
  failures++;
} finally {
  // Ledger rows first, then everything created, newest first
  for (const id of ledgerIds) created.push(['transaction', id]);
  for (const [model, id] of created.reverse()) {
    await gql(`mutation ($input: Delete${cap(model)}Input!) { delete${cap(model)}(input: $input) { id } }`, { input: { id } }).catch(() => {});
  }
  console.log(`\nCleaned up ${created.length} rows (notifications to the test users expire on their own).`);
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
