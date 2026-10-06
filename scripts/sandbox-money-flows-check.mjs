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
 *   7. money (createBetWithStake): the bet, the creator's participant row and the stake
 *      land together and read back like an app-created bet; a retry charges nothing;
 *      short balances and invalid fields write nothing; another user cannot create over
 *      an existing bet id
 *   8. money (resolveBet): only the creator resolves; the winner, time and window, PENDING
 *      winnings with the server's fee and $0 losses are recorded and no money moves; then
 *      the payout processor pays them; an upheld dispute and a re-resolution pay the new
 *      winner, not the old
 *   9. money (acceptBetResult): only participants accept, only a result; the last acceptance
 *      closes the window early and the payout follows
 *  10. money (buySquares, cancelSquaresGame): rows, debit and counts together; a sold or
 *      raced square sells once; retries and short balances; the filling purchase locks
 *      the grid with server-drawn numbers; who may cancel, and every buyer refunded
 *  11. scheduled-squares-checker, overtime: periods 1-3 pay as they come, the final share
 *      waits for the end and pays once on the overtime score; payouts total the pot
 *  12. money (requestWithdrawal, adminDecideTransaction): the amount is reserved at request
 *      and once per request; only admins decide; approval completes, rejection refunds;
 *      older unreserved withdrawals are taken on approval; deposit fees are kept
 *  13. money (adminResolveDispute): admins only; upholding clears the winner and cancels
 *      pending payouts so the creator resolves again; dismissing leaves the result; a
 *      paid bet's dispute cannot be upheld
 *  14. money (ensureMyUserRecord): the server creates the caller's own record with balance
 *      0 and role USER whatever is sent, and a second call changes nothing
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

const joinAs = (userId, betId, side, amount) => asUser(userId, 'joinBet', { betId, side, amount });

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

    // 7. Creating a bet through the server (createBetWithStake) ----------------------------
    const { randomUUID } = await import('node:crypto');
    const form = (over = {}) => ({
      title: `${run} created`, description: 'sandbox-money-flows-check', category: 'CUSTOM', amount: 4,
      side: 'A', sideAName: 'Yes', sideBName: 'No', deadlineMinutes: 30, isPrivate: false, ...over,
    });
    const trackCreate = (newBetId, userId) => {
      created.push(['bet', newBetId]);
      created.push(['participant', `${newBetId}#${userId}`]);
      ledgerIds.push(`stake#${newBetId}#${userId}`);
    };

    const ginny = await user('ginny');
    await credit(ginny, 10);
    const newBetId = randomUUID();
    trackCreate(newBetId, ginny);
    const made = await asUser(ginny, 'createBetWithStake', form({ betId: newBetId }));
    const nb = await get('bet', newBetId, 'status creatorId betAmount totalPot sideACount sideBCount participantUserIds odds deadline category isTestBet');
    const np = await get('participant', `${newBetId}#${ginny}`, 'side amount status');
    check('create writes the bet, the creator\'s row and the stake together', made.status === 'created' && same(made.balance, 6) && same(await balance(ginny), 6) && np?.side === 'A' && np.amount === 4, JSON.stringify(made));
    check('the new bet is ACTIVE with the creator counted', nb?.status === 'ACTIVE' && nb.creatorId === ginny && nb.betAmount === 4 && nb.totalPot === 4 && nb.sideACount === 1 && nb.sideBCount === 0 && nb.participantUserIds.join() === ginny && nb.category === 'CUSTOM' && nb.isTestBet === false, JSON.stringify(nb));
    const odds = JSON.parse(nb.odds);
    check('the bet\'s odds read back as the app writes them', odds.sideAName === 'Yes' && odds.sideBName === 'No', nb.odds);
    const indexed = await gql('query ($f: ModelBetFilterInput) { betsByStatus(status: ACTIVE, filter: $f) { items { id } nextToken } }', { f: { id: { eq: newBetId } } });
    let inIndex = indexed.betsByStatus.items.length > 0;
    for (let token = indexed.betsByStatus.nextToken; !inIndex && token; ) {
      const page = await gql('query ($f: ModelBetFilterInput, $t: String) { betsByStatus(status: ACTIVE, filter: $f, nextToken: $t) { items { id } nextToken } }', { f: { id: { eq: newBetId } }, t: token });
      inIndex = page.betsByStatus.items.length > 0;
      token = page.betsByStatus.nextToken;
    }
    check('the new bet is in the ACTIVE feed index', inIndex);

    const retried = await asUser(ginny, 'createBetWithStake', form({ betId: newBetId }));
    check('retrying the same create charges nothing more', retried.status === 'created' && same(await balance(ginny), 6), JSON.stringify(retried));

    const harry = await user('harry');
    await credit(harry, 5);
    trackJoin(newBetId, harry);
    const joinedNew = await joinAs(harry, newBetId, 'B', 4);
    check('a server-created bet can be joined', joinedNew.status === 'joined' && same(await balance(harry), 1), JSON.stringify(joinedNew));

    const poorBetId = randomUUID();
    trackCreate(poorBetId, harry);
    const poorCreate = await asUser(harry, 'createBetWithStake', form({ betId: poorBetId, amount: 3 }));
    check('a create the balance cannot cover writes nothing', poorCreate.reason === 'INSUFFICIENT_FUNDS' && !(await get('bet', poorBetId, 'id')) && same(await balance(harry), 1), JSON.stringify(poorCreate));

    const badDeadline = await asUser(harry, 'createBetWithStake', form({ betId: randomUUID(), amount: 1, deadlineMinutes: 0 }));
    check('a create with an invalid field is refused', badDeadline.reason === 'INVALID' && badDeadline.field === 'deadlineMinutes', JSON.stringify(badDeadline));

    const hijack = await asUser(harry, 'createBetWithStake', form({ betId: newBetId, amount: 1 }));
    const after = await get('bet', newBetId, 'creatorId totalPot');
    check('another user cannot create over an existing bet id', hijack.reason === 'INVALID' && hijack.field === 'betId' && after.creatorId === ginny && same(await balance(harry), 1), `${JSON.stringify(hijack)} ${JSON.stringify(after)}`);

    // 8. Resolving through the server (resolveBet), then paying out ------------------------
    const setBet = (id, fields) => gql('mutation ($i: UpdateBetInput!) { updateBet(input: $i) { id } }', { i: { id, ...fields } });
    const pair = async (tag) => {
      const creator = await user(`${tag}-creator`);
      const taker = await user(`${tag}-taker`);
      await credit(creator, 5);
      await credit(taker, 5);
      const id = randomUUID();
      trackCreate(id, creator);
      trackJoin(id, taker);
      for (const pid of [`${id}#${creator}`, `${id}#${taker}`]) ledgerIds.push(`payout#${pid}`, `loss#${pid}`);
      await asUser(creator, 'createBetWithStake', form({ betId: id, amount: 5, side: 'A' }));
      await joinAs(taker, id, 'B', 5);
      return { id, creator, taker, cPid: `${id}#${creator}`, tPid: `${id}#${taker}` };
    };
    const tx = (id) => get('transaction', id, 'status type amount actualAmount platformFee');

    const r = await pair('res');
    const byTaker = await asUser(r.taker, 'resolveBet', { betId: r.id, winningSide: 'B' });
    check('only the creator can resolve', byTaker.reason === 'NOT_CREATOR', JSON.stringify(byTaker));

    const resolvedNow = await asUser(r.creator, 'resolveBet', { betId: r.id, winningSide: 'A' });
    const rb2 = await get('bet', r.id, 'status winningSide resolvedAt disputeWindowEndsAt');
    const hoursOpen = (new Date(rb2.disputeWindowEndsAt).getTime() - new Date(rb2.resolvedAt).getTime()) / 3600_000;
    check('resolving records the winner, the time and a 48-hour window', resolvedNow.status === 'resolved' && rb2.status === 'PENDING_RESOLUTION' && rb2.winningSide === 'A' && Math.round(hoursOpen) === 48, JSON.stringify(rb2));
    const pending = await tx(`payout#${r.cPid}`);
    const lost = await tx(`loss#${r.tPid}`);
    check('the winnings are PENDING with the server\'s fee, the loss is recorded at $0', pending?.status === 'PENDING' && pending.amount === 10 && pending.actualAmount === 9.7 && pending.platformFee === 0.3 && lost?.status === 'COMPLETED' && lost.amount === 0, `${JSON.stringify(pending)} ${JSON.stringify(lost)}`);
    check('no money moves at resolution', same(await balance(r.creator), 0) && same(await balance(r.taker), 0));
    const parts = await Promise.all([get('participant', r.cPid, 'payout status'), get('participant', r.tPid, 'payout status')]);
    check('each participant\'s outcome is recorded for the app', parts[0].payout === 10 && parts[0].status === 'ACCEPTED' && parts[1].payout === 0 && parts[1].status === 'DECLINED', JSON.stringify(parts));
    const twice = await asUser(r.creator, 'resolveBet', { betId: r.id, winningSide: 'B' });
    check('a resolved bet cannot be resolved again', twice.reason === 'NOT_RESOLVABLE', JSON.stringify(twice));
    const lateJoiner = await user('late');
    await credit(lateJoiner, 5);
    const lateJoin = await joinAs(lateJoiner, r.id, 'B', 5);
    check('a resolved bet cannot be joined', lateJoin.reason === 'NOT_OPEN', JSON.stringify(lateJoin));

    // The window passes: the payout processor pays what the resolution recorded
    await setBet(r.id, { disputeWindowEndsAt: hoursAgo(0.1) });
    await invoke('payoutprocessor');
    const paidRow = await tx(`payout#${r.cPid}`);
    check('after the window the winner is paid, once', (await get('bet', r.id, 'status')).status === 'RESOLVED' && paidRow.status === 'COMPLETED' && same(await balance(r.creator), 9.7) && same(await balance(r.taker), 0), `${JSON.stringify(paidRow)} creator ${await balance(r.creator)}`);
    for (const h of (await gql('query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }', { f: { relatedBetId: { eq: r.id } } })).listTrustScoreHistories.items) {
      created.push(['trustScoreHistory', h.id]);
    }

    // An upheld dispute sends the bet back; the creator re-resolves the other way
    const d = await pair('dsp');
    await asUser(d.creator, 'resolveBet', { betId: d.id, winningSide: 'A' });
    await new Promise((resolve) => setTimeout(resolve, 1100)); // the dispute is upheld after the resolution
    await create('dispute', {
      betId: d.id, filedBy: d.taker, againstUserId: d.creator, reason: 'INCORRECT_RESOLUTION', description: run,
      status: 'RESOLVED_FOR_FILER', resolvedAt: new Date().toISOString(),
    });
    await setBet(d.id, { winningSide: null }); // what disputeService does on an upheld dispute
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const reResolved = await asUser(d.creator, 'resolveBet', { betId: d.id, winningSide: 'B' });
    const [oldWin, oldLoss, newWin, newLoss] = await Promise.all([
      tx(`payout#${d.cPid}`), tx(`loss#${d.tPid}`), tx(`payout#${d.tPid}`), tx(`loss#${d.cPid}`),
    ]);
    check('re-resolving cancels the overturned result and records the new one', reResolved.status === 'resolved' && oldWin.status === 'CANCELLED' && oldLoss.status === 'CANCELLED' && newWin.status === 'PENDING' && newWin.amount === 10 && newLoss.status === 'COMPLETED', JSON.stringify({ oldWin, oldLoss, newWin, newLoss }));
    await setBet(d.id, { disputeWindowEndsAt: hoursAgo(0.1) });
    await invoke('payoutprocessor');
    check('after the window the new winner is paid and the old one is not', (await get('bet', d.id, 'status')).status === 'RESOLVED' && same(await balance(d.taker), 9.7) && same(await balance(d.creator), 0), `taker ${await balance(d.taker)}, creator ${await balance(d.creator)}`);
    for (const h of (await gql('query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }', { f: { relatedBetId: { eq: d.id } } })).listTrustScoreHistories.items) {
      created.push(['trustScoreHistory', h.id]);
    }

    // 9. Accepting the result (acceptBetResult): everyone accepts, the window closes early --
    const a = await pair('acc');
    const thirdTaker = await user('acc-third');
    await credit(thirdTaker, 5);
    trackJoin(a.id, thirdTaker);
    ledgerIds.push(`payout#${a.id}#${thirdTaker}`, `loss#${a.id}#${thirdTaker}`);
    await joinAs(thirdTaker, a.id, 'B', 5);
    const early = await asUser(a.taker, 'acceptBetResult', { betId: a.id });
    check('a result cannot be accepted before there is one', early.reason === 'NOT_AWAITING', JSON.stringify(early));
    await asUser(a.creator, 'resolveBet', { betId: a.id, winningSide: 'A' });
    const windowBefore = (await get('bet', a.id, 'disputeWindowEndsAt')).disputeWindowEndsAt;

    const byCreator = await asUser(a.creator, 'acceptBetResult', { betId: a.id });
    const byStranger = await asUser(lateJoiner, 'acceptBetResult', { betId: a.id });
    check('the creator and outsiders cannot accept', byCreator.reason === 'IS_CREATOR' && byStranger.reason === 'NOT_PARTICIPANT', `${JSON.stringify(byCreator)} ${JSON.stringify(byStranger)}`);

    const first = await asUser(a.taker, 'acceptBetResult', { betId: a.id });
    const stillOpen = (await get('bet', a.id, 'disputeWindowEndsAt')).disputeWindowEndsAt;
    check('one acceptance of two leaves the window open', first.status === 'accepted' && !first.closedEarly && first.accepted === 1 && first.total === 2 && stillOpen === windowBefore, JSON.stringify(first));
    const last = await asUser(thirdTaker, 'acceptBetResult', { betId: a.id });
    const closedAt = (await get('bet', a.id, 'disputeWindowEndsAt')).disputeWindowEndsAt;
    check('the last acceptance closes the window early', last.closedEarly === true && new Date(closedAt).getTime() < Date.now(), `${JSON.stringify(last)} window ${closedAt}`);
    await invoke('payoutprocessor');
    check('the payout follows without waiting 48 hours', (await get('bet', a.id, 'status')).status === 'RESOLVED' && same(await balance(a.creator), 14.55), `creator ${await balance(a.creator)}`);

    // 10. Squares through the server (buySquares, cancelSquaresGame) -----------------------
    const eventForSquares = await create('liveEvent', {
      id: `${run}-sq-event`, externalId: `${run}-sq-event`, sport: 'NFL', homeTeam: 'H', awayTeam: 'A',
      scheduledTime: new Date(Date.now() + 86_400_000).toISOString(), status: 'UPCOMING',
    });
    const squaresGame = async (tag, fields = {}) =>
      create('squaresGame', {
        id: `${run}-${tag}`, title: `${run} ${tag}`, eventId: eventForSquares, creatorId: alice, pricePerSquare: 2,
        totalPot: 0, squaresSold: 0, status: 'ACTIVE', numbersAssigned: false, isPrivate: false,
        locksAt: new Date(Date.now() + 86_400_000).toISOString(),
        payoutStructure: JSON.stringify({ period1: 0.25, period2: 0.25, period3: 0.25, period4: 0.25 }), ...fields,
      });
    const cellIds = (gameId, cells) => cells.map(([r, c]) => `${gameId}#${r}-${c}`);
    const buyId = (gameId, userId, cells) => `squares-buy#${gameId}#${userId}#${cells.map(([r, c]) => `${r}${c}`).sort().join('.')}`;
    const buy = async (userId, gameId, cells, owner = 'Owner') => {
      cellIds(gameId, cells).forEach((id) => created.push(['squaresPurchase', id]));
      ledgerIds.push(buyId(gameId, userId, cells), `squares-refund#${gameId}#${userId}`);
      return asUser(userId, 'buySquares', { squaresGameId: gameId, ownerName: owner, squares: JSON.stringify(cells.map(([row, col]) => ({ row, col }))) });
    };

    const g = await squaresGame('sq-buy');
    const [mia, ned, oli, pat] = [await user('mia'), await user('ned'), await user('oli'), await user('pat')];
    for (const [who, amount] of [[mia, 10], [ned, 10], [oli, 10], [pat, 1]]) await credit(who, amount);

    const bought = await buy(mia, g, [[0, 0], [0, 1]], 'Mia');
    const gs = await get('squaresGame', g, 'squaresSold totalPot');
    const row = await get('squaresPurchase', `${g}#0-1`, 'userId ownerName amount purchasedAt transactionId');
    check('buying writes one row per square, the debit and the counts together', bought.status === 'bought' && same(bought.balance, 6) && same(await balance(mia), 6) && gs.squaresSold === 2 && gs.totalPot === 4 && row?.userId === mia && row.amount === 2 && Boolean(row.purchasedAt), `${JSON.stringify(bought)} ${JSON.stringify(gs)} ${JSON.stringify(row)}`);

    const clash = await buy(ned, g, [[0, 1], [5, 5]]);
    check('a square already sold is refused, and nothing is written', clash.reason === 'SQUARE_TAKEN' && clash.taken?.[0]?.col === 1 && same(await balance(ned), 10) && !(await get('squaresPurchase', `${g}#5-5`, 'id')), JSON.stringify(clash));

    const race = await Promise.all([buy(ned, g, [[7, 7]]), buy(oli, g, [[7, 7]])]);
    const winners = race.filter((r) => r.status === 'bought').length;
    const losers = race.filter((r) => r.reason === 'SQUARE_TAKEN').length;
    const charged = (await balance(ned)) + (await balance(oli));
    check('two buyers racing for one square: one gets it, one is charged', winners === 1 && losers === 1 && same(charged, 18), `${race.map((r) => r.status + (r.reason ? ':' + r.reason : ''))} charged total ${20 - charged}`);

    const rebuy = await buy(mia, g, [[0, 0], [0, 1]], 'Mia');
    check('retrying the same purchase charges nothing more', rebuy.status === 'bought' && same(await balance(mia), 6), JSON.stringify(rebuy));

    const short = await buy(pat, g, [[9, 9]]);
    check('a purchase the balance cannot cover writes nothing', short.reason === 'INSUFFICIENT_FUNDS' && !(await get('squaresPurchase', `${g}#9-9`, 'id')) && same(await balance(pat), 1), JSON.stringify(short));

    const strangerCancel = await asUser(pat, 'cancelSquaresGame', { squaresGameId: g, reason: 'nope' });
    check('only the creator or an admin can cancel', strangerCancel.reason === 'NOT_ALLOWED', JSON.stringify(strangerCancel));
    const cancelled = await asUser(alice, 'cancelSquaresGame', { squaresGameId: g, reason: null });
    const raceWinner = race[0].status === 'bought' ? ned : oli;
    check('the creator cancels and every buyer gets back what they paid', cancelled.status === 'cancelled' && (await get('squaresGame', g, 'status')).status === 'CANCELLED' && same(await balance(mia), 10) && same(await balance(raceWinner), 10), `${JSON.stringify(cancelled)} mia ${await balance(mia)} racer ${await balance(raceWinner)}`);

    // Filling the grid locks it, with numbers drawn on the server
    const full = await squaresGame('sq-full', { pricePerSquare: 1, squaresSold: 98, totalPot: 98 });
    const filled = await buy(pat, full, [[4, 4]]);
    await credit(pat, 1);
    const fillLast = await buy(pat, full, [[4, 5]]);
    const fg = await get('squaresGame', full, 'status numbersAssigned rowNumbers colNumbers squaresSold');
    const isPermutation = (a) => Array.isArray(a) && [...a].sort((x, y) => x - y).join() === '0,1,2,3,4,5,6,7,8,9';
    check('the purchase that fills the grid locks it with a full set of numbers', filled.status === 'bought' && fillLast.locked === true && fg.status === 'LOCKED' && fg.numbersAssigned === true && isPermutation(fg.rowNumbers) && isPermutation(fg.colNumbers), `${JSON.stringify(fillLast)} ${JSON.stringify(fg)}`);
    const afterLock = await buy(mia, full, [[0, 0]]);
    check('a locked grid takes no more purchases', afterLock.reason === 'NOT_OPEN', JSON.stringify(afterLock));

    // An admin releases a game stuck awaiting resolution
    const stuck = await squaresGame('sq-stuck');
    await buy(oli, stuck, [[2, 2]]);
    await gql('mutation ($i: UpdateSquaresGameInput!) { updateSquaresGame(input: $i) { id } }', { i: { id: stuck, status: 'PENDING_RESOLUTION' } });
    const byCreatorLate = await asUser(alice, 'cancelSquaresGame', { squaresGameId: stuck, reason: null });
    const oliBefore = await balance(oli);
    const byAdmin = await asUser(pat, 'cancelSquaresGame', { squaresGameId: stuck, reason: 'Scores never arrived' }, ['admins']);
    check('only an admin can release a stuck game, and the buyers are refunded', byCreatorLate.reason === 'NOT_CANCELLABLE' && byAdmin.status === 'cancelled' && same(await balance(oli), oliBefore + 2), `${JSON.stringify(byCreatorLate)} ${JSON.stringify(byAdmin)}`);

    // 11. Overtime: the final share pays once, on the final score, when the game is over ----
    // Tied 24-24 after regulation, 30-24 after overtime. Rows and columns are numbered
    // 0-9 in order, so a score's square is (home % 10, away % 10).
    const otEvent = await create('liveEvent', {
      id: `${run}-ot-event`, externalId: `${run}-ot-event`, sport: 'NFL', homeTeam: 'H', awayTeam: 'A',
      scheduledTime: hoursAgo(4), status: 'LIVE',
      homePeriodScores: JSON.stringify([7, 10, 17, 24, 30]), awayPeriodScores: JSON.stringify([3, 14, 17, 24, 24]),
    });
    const ot = await create('squaresGame', {
      id: `${run}-sq-ot`, title: `${run} sq-ot`, eventId: otEvent, creatorId: alice, pricePerSquare: 10,
      totalPot: 40, squaresSold: 4, status: 'LIVE', locksAt: hoursAgo(3), isPrivate: false,
      numbersAssigned: true, rowNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], colNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      payoutStructure: JSON.stringify({ period1: 0.15, period2: 0.25, period3: 0.15, period4: 0.45 }),
    });
    const [quarters, overtimeWinner, regulationSquare] = [await user('ot-q'), await user('ot-final'), await user('ot-reg')];
    const otNow = new Date().toISOString();
    for (const [uid, r, c] of [[quarters, 7, 3], [quarters, 7, 7], [overtimeWinner, 0, 4], [regulationSquare, 4, 4]]) {
      await create('squaresPurchase', { squaresGameId: ot, userId: uid, ownerName: uid, gridRow: r, gridCol: c, amount: 10, purchasedAt: otNow });
    }
    for (const p of ['PERIOD_1', 'PERIOD_2', 'PERIOD_3', 'PERIOD_4', 'PERIOD_5']) {
      ledgerIds.push(`squares-payout#${ot}#${p}`);
      created.push(['squaresPayout', `${ot}#${p}`]);
    }
    const otPayouts = async () => (await gql('query ($id: ID!) { payoutsBySquaresGame(squaresGameId: $id) { items { period amount userId } } }', { id: ot })).payoutsBySquaresGame.items;

    await invoke('scheduledsquareschecker');
    const live = await otPayouts();
    check('while the game is live, periods 1-3 pay and the final waits', live.map((p) => p.period).sort().join() === 'PERIOD_1,PERIOD_2,PERIOD_3' && (await get('squaresGame', ot, 'status')).status === 'LIVE', JSON.stringify(live));

    await gql('mutation ($i: UpdateLiveEventInput!) { updateLiveEvent(input: $i) { id } }', { i: { id: otEvent, status: 'FINISHED' } });
    await invoke('scheduledsquareschecker');
    const done = await otPayouts();
    const final = done.find((p) => p.period === 'PERIOD_4');
    const grossTotal = done.reduce((sum, p) => sum + p.amount, 0);
    check('the final share goes to the overtime score, once, and nothing pays overtime itself', final?.userId === overtimeWinner && final.amount === 18 && done.length === 4 && same(await balance(regulationSquare), 0), JSON.stringify(done));
    check('everything paid adds up to the pot, not more', same(grossTotal, 40) && same((await balance(quarters)) + (await balance(overtimeWinner)), 40 * 0.97), `gross ${grossTotal}, credited ${(await balance(quarters)) + (await balance(overtimeWinner))}`);
    check('with all four paid the game resolves', (await get('squaresGame', ot, 'status')).status === 'RESOLVED');

    // 12. Withdrawals (requestWithdrawal) and admin decisions (adminDecideTransaction) ------
    const wal = await user('wal');
    await credit(wal, 100);
    const method = await create('paymentMethod', {
      userId: wal, type: 'VENMO', venmoUsername: 'wal-venmo', displayName: 'Wal Venmo',
      isVerified: false, isActive: true, isDefault: true,
    });
    const otherMethod = await create('paymentMethod', {
      userId: alice, type: 'VENMO', venmoUsername: 'alice-venmo', displayName: 'Alice Venmo', isVerified: true, isActive: true, isDefault: true,
    });
    const asAdmin = (field, args) => asUser(`${run}-admin`, field, args, ['admins']);
    const withdraw = (requestId, amount, paymentMethodId = method) => {
      ledgerIds.push(`withdrawal#${requestId}`);
      return asUser(wal, 'requestWithdrawal', { requestId, amount, paymentMethodId });
    };
    const trustRows = async (transactionId) => {
      const r = await gql('query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }', { f: { relatedTransactionId: { eq: transactionId } } });
      for (const h of r.listTrustScoreHistories.items) created.push(['trustScoreHistory', h.id]);
    };

    const w1 = randomUUID();
    const requested = await withdraw(w1, 50);
    const w1row = await get('transaction', `withdrawal#${w1}`, 'status amount platformFee actualAmount venmoUsername');
    check('a withdrawal request takes the amount now, with the fee recorded (unverified account allowed)', requested.status === 'requested' && same(requested.balance, 50) && same(await balance(wal), 50) && w1row?.status === 'PENDING' && w1row.amount === 50 && w1row.platformFee === 1 && w1row.actualAmount === 49 && w1row.venmoUsername === 'wal-venmo', `${JSON.stringify(requested)} ${JSON.stringify(w1row)}`);
    const repeated = await withdraw(w1, 50);
    check('repeating the same request takes nothing more', repeated.status === 'requested' && same(await balance(wal), 50), JSON.stringify(repeated));
    const tooMuch = await withdraw(randomUUID(), 60);
    check('what a pending request reserved cannot be withdrawn again', tooMuch.reason === 'INSUFFICIENT_FUNDS' && same(await balance(wal), 50), JSON.stringify(tooMuch));
    const notMine = await withdraw(randomUUID(), 10, otherMethod);
    check('only the user\'s own Venmo account can receive it', notMine.reason === 'NO_METHOD', JSON.stringify(notMine));

    const byUser = await asUser(wal, 'adminDecideTransaction', { transactionId: `withdrawal#${w1}`, approve: true });
    check('an account outside the admins group cannot decide', byUser.reason === 'NOT_ADMIN', JSON.stringify(byUser));
    const approved = await asAdmin('adminDecideTransaction', { transactionId: `withdrawal#${w1}`, approve: true });
    await trustRows(`withdrawal#${w1}`);
    check('approving completes it without taking the money again', approved.status === 'decided' && approved.outcome === 'COMPLETED' && same(await balance(wal), 50) && (await get('transaction', `withdrawal#${w1}`, 'status')).status === 'COMPLETED', JSON.stringify(approved));
    const decidedAgain = await asAdmin('adminDecideTransaction', { transactionId: `withdrawal#${w1}`, approve: false, reason: 'late' });
    check('a decided withdrawal cannot be decided again', decidedAgain.reason === 'NOT_PENDING' && same(await balance(wal), 50), JSON.stringify(decidedAgain));

    const w2 = randomUUID();
    await withdraw(w2, 20);
    const rejected = await asAdmin('adminDecideTransaction', { transactionId: `withdrawal#${w2}`, approve: false, reason: 'Handle not found' });
    await trustRows(`withdrawal#${w2}`);
    check('rejecting gives the money back', rejected.outcome === 'FAILED' && same(await balance(wal), 50) && (await get('transaction', `withdrawal#${w2}`, 'status failureReason')).failureReason === 'Handle not found', JSON.stringify(rejected));

    // Requested by an older app version: nothing was taken then, so approval takes it
    const legacy = await create('transaction', { userId: wal, type: 'WITHDRAWAL', status: 'PENDING', amount: 10, balanceBefore: 50, balanceAfter: 40, createdAt: new Date().toISOString() });
    const legacyApproved = await asAdmin('adminDecideTransaction', { transactionId: legacy, approve: true });
    await trustRows(legacy);
    check('an older, unreserved withdrawal is taken on approval', legacyApproved.outcome === 'COMPLETED' && same(await balance(wal), 40), JSON.stringify(legacyApproved));

    // A card deposit Stripe never confirmed, approved by hand: credited, its fee kept
    const deposit = await create('transaction', { userId: wal, type: 'DEPOSIT', status: 'PENDING', amount: 25, platformFee: 0.5, balanceBefore: 40, balanceAfter: 65, createdAt: new Date().toISOString() });
    const depositApproved = await asAdmin('adminDecideTransaction', { transactionId: deposit, approve: true });
    await trustRows(deposit);
    const depositRow = await get('transaction', deposit, 'status platformFee actualAmount');
    check('approving a deposit credits it and keeps its recorded fee', depositApproved.outcome === 'COMPLETED' && same(await balance(wal), 65) && depositRow.status === 'COMPLETED' && depositRow.platformFee === 0.5, JSON.stringify(depositRow));

    // 13. Disputes (adminResolveDispute) ---------------------------------------------------
    const disputeOn = (betId, filedBy, againstUserId) =>
      create('dispute', { betId, filedBy, againstUserId, reason: 'INCORRECT_RESOLUTION', description: run, status: 'PENDING' });
    const trustByDispute = async (disputeId) => {
      const r = await gql('query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }', { f: { relatedDisputeId: { eq: disputeId } } });
      for (const h of r.listTrustScoreHistories.items) created.push(['trustScoreHistory', h.id]);
    };

    const u = await pair('uph');
    await asUser(u.creator, 'resolveBet', { betId: u.id, winningSide: 'A' });
    const d1 = await disputeOn(u.id, u.taker, u.creator);
    const notAdmin = await asUser(u.taker, 'adminResolveDispute', { disputeId: d1, outcome: 'RESOLVED_FOR_FILER' });
    check('only an admin can resolve a dispute', notAdmin.reason === 'NOT_ADMIN', JSON.stringify(notAdmin));

    const upheld = await asAdmin('adminResolveDispute', { disputeId: d1, outcome: 'RESOLVED_FOR_FILER', resolution: 'Wrong winner' });
    await trustByDispute(d1);
    const ub = await get('bet', u.id, 'status winningSide');
    const voided = await tx(`payout#${u.cPid}`);
    const d1row = await get('dispute', d1, 'status resolvedBy');
    check('upholding clears the winner and cancels the pending payout', upheld.status === 'resolved' && upheld.payoutsCancelled === 1 && ub.status === 'PENDING_RESOLUTION' && !ub.winningSide && voided.status === 'CANCELLED' && d1row.status === 'RESOLVED_FOR_FILER', `${JSON.stringify(upheld)} ${JSON.stringify(ub)} ${JSON.stringify(voided)}`);
    const redo = await asUser(u.creator, 'resolveBet', { betId: u.id, winningSide: 'B' });
    check('the creator can then resolve again, and the new winner is recorded', redo.status === 'resolved' && (await tx(`payout#${u.tPid}`))?.status === 'PENDING', JSON.stringify(redo));

    const d2 = await disputeOn(u.id, u.creator, u.creator);
    const dismissed = await asAdmin('adminResolveDispute', { disputeId: d2, outcome: 'DISMISSED' });
    await trustByDispute(d2);
    check('dismissing leaves the result standing', dismissed.status === 'resolved' && (await get('bet', u.id, 'winningSide')).winningSide === 'B' && (await tx(`payout#${u.tPid}`)).status === 'PENDING', JSON.stringify(dismissed));
    const again2 = await asAdmin('adminResolveDispute', { disputeId: d2, outcome: 'RESOLVED_FOR_FILER' });
    check('a resolved dispute cannot be resolved again', again2.reason === 'NOT_OPEN', JSON.stringify(again2));

    // Scenario 8's bet was paid out: upholding a dispute on it would pay it twice
    const d3 = await disputeOn(r.id, r.taker, r.creator);
    const onPaid = await asAdmin('adminResolveDispute', { disputeId: d3, outcome: 'RESOLVED_FOR_FILER' });
    check('a dispute against a bet already paid cannot be upheld here', onPaid.reason === 'ALREADY_PAID' && (await get('bet', r.id, 'status')).status === 'RESOLVED', JSON.stringify(onPaid));

    // 14. A new user's own record (ensureMyUserRecord) ---------------------------------------
    const newcomer = `${run}-newcomer`;
    created.push(['user', newcomer]);
    const made14 = await asUser(newcomer, 'ensureMyUserRecord', { email: 'new@example.invalid', displayName: 'New Person', tosVersion: 'v1', privacyVersion: 'v1', balance: 1000, role: 'ADMIN' });
    const rec = await get('user', newcomer, 'id balance role trustScore displayName email tosAccepted');
    check('a new user\'s record is created by the server, with balance 0 and role USER whatever is sent', made14.status === 'created' && rec?.balance === 0 && rec.role === 'USER' && rec.trustScore === 5 && rec.displayName === 'New Person' && rec.tosAccepted === true, `${JSON.stringify(made14)} ${JSON.stringify(rec)}`);
    const again14 = await asUser(newcomer, 'ensureMyUserRecord', { displayName: 'Someone Else' });
    check('a second call finds it and changes nothing', again14.status === 'exists' && (await get('user', newcomer, 'displayName')).displayName === 'New Person', JSON.stringify(again14));
    for (const h of (await gql('query ($f: ModelTrustScoreHistoryFilterInput) { listTrustScoreHistories(filter: $f, limit: 1000) { items { id } } }', { f: { relatedBetId: { eq: a.id } } })).listTrustScoreHistories.items) {
      created.push(['trustScoreHistory', h.id]);
    }
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
