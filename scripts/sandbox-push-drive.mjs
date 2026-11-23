/**
 * Drives one push per notification category at a real device signed in to the sandbox,
 * for the on-device checklist (docs/NOTIFICATIONS_PLAN.md §5). Throwaway users play the
 * other side; server-raised notifications come from the real Lambdas, and the ones the app
 * raises (a friend request, an invitation) are written as the app writes them.
 *
 *   SANDBOX_STACK=<sandbox stack> node scripts/sandbox-push-drive.mjs <step>
 *
 * Steps, in order (each says what should arrive):
 *   whoami     find the device user from their newest active Android device
 *   friends    a friend request                       (Friends)
 *   invite     an invitation to a bet                 (Invitations)
 *   joined     someone joins a $1 bet of yours        (Activity on my bets)
 *   close      that bet closes: pick the winner       (Disputes & action needed)
 *   results    a $1 bet you joined is resolved        (Results & payouts)
 *   refund     a $1 bet of yours nobody joins closes  (Cancellations & refunds)
 *   reminder   squares you were invited to lock soon  (Reminders)
 *   squares    you buy a $1 square in that game       (Squares updates)
 *   money      a $1 deposit is approved               (Money)
 *   cleanup    delete the throwaway users and their rows
 *
 * The device user's own stakes and purchases are real ledger rows on the sandbox and are
 * left in place; only throwaway users' rows are deleted. Sandbox only: refuses unless
 * amplify_outputs.json points at SANDBOX_STACK's API.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { CloudFormationClient, DescribeStackResourcesCommand, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
const endpoint = outputs.data.url;
const region = outputs.data.aws_region;
// Ids made by earlier steps (the bet to close, the game to buy in, what to clean up)
const stateFile = join(tmpdir(), 'sidebet-push-drive-state.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile)) : { created: [], ledgerIds: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));

const stackName = process.env.SANDBOX_STACK;
if (!stackName || !stackName.includes('-sandbox-')) {
  console.error('Set SANDBOX_STACK to your sandbox stack name (it must contain "-sandbox-").');
  process.exit(1);
}
const { Stacks } = await new CloudFormationClient({ region }).send(new DescribeStacksCommand({ StackName: stackName }));
if (!JSON.stringify(Stacks[0].Outputs ?? []).includes(new URL(endpoint).hostname.split('.')[0])) {
  console.error(`Refusing: ${endpoint} is not an output of ${stackName}.`);
  process.exit(1);
}

const FUNCTIONS = ['scheduledbetchecker', 'scheduledsquareschecker', 'money'];
const cfn = new CloudFormationClient({ region });
const lambda = new LambdaClient({ region });
const functions = {};
const stacks = [stackName];
while (stacks.length) {
  const { StackResources = [] } = await cfn.send(new DescribeStackResourcesCommand({ StackName: stacks.pop() }));
  for (const r of StackResources) {
    if (r.ResourceType === 'AWS::CloudFormation::Stack' && r.PhysicalResourceId) stacks.push(r.PhysicalResourceId);
    if (r.ResourceType !== 'AWS::Lambda::Function' || !r.PhysicalResourceId) continue;
    for (const key of FUNCTIONS) if (r.LogicalResourceId.toLowerCase().replace(/[^a-z]/g, '').includes(key)) functions[key] = r.PhysicalResourceId;
  }
}

async function invoke(key) {
  const result = await lambda.send(new InvokeCommand({ FunctionName: functions[key], Payload: Buffer.from('{}') }));
  if (result.FunctionError) throw new Error(`${key} failed: ${Buffer.from(result.Payload ?? []).toString()}`);
}

async function asUser(userId, fieldName, args, groups = null) {
  const event = { typeName: 'Mutation', fieldName, arguments: args, identity: { sub: userId, username: userId, claims: { sub: userId }, groups }, source: null, request: { headers: {} }, prev: null };
  const result = await lambda.send(new InvokeCommand({ FunctionName: functions.money, Payload: Buffer.from(JSON.stringify(event)) }));
  const payload = Buffer.from(result.Payload ?? []).toString();
  if (result.FunctionError) throw new Error(`${fieldName} failed: ${payload}`);
  return JSON.parse(payload);
}

const signer = new SignatureV4({ credentials: defaultProvider(), region, service: 'appsync', sha256: Sha256 });
async function gql(query, variables) {
  const url = new URL(endpoint);
  const request = new HttpRequest({ method: 'POST', protocol: url.protocol, hostname: url.hostname, path: url.pathname, headers: { 'content-type': 'application/json', host: url.hostname }, body: JSON.stringify({ query, variables }) });
  const signed = await signer.sign(request);
  const json = await (await fetch(endpoint, { method: 'POST', headers: signed.headers, body: signed.body })).json();
  if (json.errors?.length) throw new Error(JSON.stringify(json.errors));
  return json.data;
}
const cap = (m) => m[0].toUpperCase() + m.slice(1);
async function create(model, input, { keep = false } = {}) {
  const data = await gql(`mutation ($input: Create${cap(model)}Input!) { create${cap(model)}(input: $input) { id } }`, { input });
  const id = data[`create${cap(model)}`].id;
  if (!keep) state.created.push([model, id]);
  return id;
}
/** Sleep until a moment has passed (plus a few seconds for the deadline check). */
const waitUntil = async (ms) => {
  const left = ms + 5_000 - Date.now();
  if (left > 0) {
    console.log(`Waiting ${Math.ceil(left / 1000)}s for the deadline...`);
    await new Promise((r) => setTimeout(r, left));
  }
};

const tag = () => `zz-push-${Date.now()}`;
async function throwaway(name, funds = 0) {
  const id = `${tag()}-${name.toLowerCase().replace(/\s+/g, '-')}`;
  await create('user', { id, username: id, displayName: name, email: `${id}@example.invalid`, balance: 0, trustScore: 5 });
  if (funds) {
    const txId = `zz-push-credit#${id}`;
    state.ledgerIds.push(txId);
    await gql('mutation ($e: AWSJSON!) { ledgerApply(entries: $e) }', {
      e: JSON.stringify([{ transactionId: txId, userId: id, type: 'ADMIN_ADJUSTMENT', delta: funds, amount: funds, status: 'COMPLETED', mode: 'create', notes: 'sandbox-push-drive' }]),
    });
  }
  return id;
}

const DAY = 86_400;
const appNotice = (type, category, fields) => ({
  type, category, expiresAt: Math.floor(Date.now() / 1000) + 90 * DAY, isRead: false, priority: 'HIGH', ...fields,
});

const form = (betId, title, over = {}) => ({
  betId, title, description: 'sandbox-push-drive', category: 'CUSTOM', amount: 1, side: 'A', sideAName: 'Yes', sideBName: 'No',
  deadlineMinutes: 30, isPrivate: true, ...over,
});

const me = () => {
  if (!state.userId) throw new Error('Run "whoami" first.');
  return state.userId;
};

const steps = {
  async whoami() {
    const data = await gql('query { listPushDevices(filter: { platform: { eq: ANDROID }, isActive: { eq: true } }, limit: 1000) { items { userId deviceName lastSeenAt appVersion } } }');
    const newest = data.listPushDevices.items.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))[0];
    if (!newest) throw new Error('No active Android device registered. Sign in on the device and allow notifications.');
    const u = (await gql('query ($id: ID!) { getUser(id: $id) { displayName username balance } }', { id: newest.userId })).getUser;
    state.userId = newest.userId;
    console.log(`Device user: ${u?.displayName ?? u?.username} (${newest.userId}), ${newest.deviceName}, seen ${newest.lastSeenAt}, balance $${u?.balance}`);
  },

  async friends() {
    const pat = await throwaway('Pat Push');
    const requestId = await create('friendRequest', { fromUserId: pat, toUserId: me(), status: 'PENDING', createdAt: new Date().toISOString() });
    await create('notification', appNotice('FRIEND_REQUEST_RECEIVED', 'FRIENDS', {
      userId: me(), title: 'New Friend Request', message: 'Pat Push sent you a friend request', priority: 'MEDIUM',
      actionType: 'view_friend_requests', relatedUserId: pat, relatedRequestId: requestId,
    }));
    console.log('Expect: "New Friend Request" (Friends). Tap: Friends, with the requests list.');
  },

  async invite() {
    const ivy = await throwaway('Ivy Invite', 5);
    const betId = randomUUID();
    state.created.push(['bet', betId], ['participant', `${betId}#${ivy}`]);
    state.ledgerIds.push(`stake#${betId}#${ivy}`);
    const made = await asUser(ivy, 'createBetWithStake', form(betId, 'Push check: will it rain today?', { deadlineMinutes: 120 }));
    if (made.status !== 'created') throw new Error(JSON.stringify(made));
    const invitationId = await create('betInvitation', { betId, fromUserId: ivy, toUserId: me(), status: 'PENDING', invitedSide: 'B', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString() });
    await create('notification', appNotice('BET_INVITATION_RECEIVED', 'INVITATIONS', {
      userId: me(), title: 'Bet Invitation', message: 'Ivy Invite invited you to bet on "Push check: will it rain today?"',
      actionType: 'view_bet_invitation', actionData: JSON.stringify({ betId, invitationId }), relatedBetId: betId, relatedUserId: ivy, relatedRequestId: invitationId,
    }));
    console.log('Expect: "Bet Invitation" (Invitations). Tap: the bet.');
  },

  async joined() {
    const betId = randomUUID();
    // Public, so the joiner needs no invitation; closes in a minute for the "close" step
    const made = await asUser(me(), 'createBetWithStake', form(betId, 'Push check: your bet, joined', { isPrivate: false, deadlineMinutes: 1 }));
    state.myJoinedBetDeadline = Date.now() + 60_000;
    if (made.status !== 'created') throw new Error(JSON.stringify(made));
    const jo = await throwaway('Jo Joiner', 5);
    state.ledgerIds.push(`stake#${betId}#${jo}`);
    const joined = await asUser(jo, 'joinBet', { betId, side: 'B', amount: 1 });
    if (joined.status !== 'joined') throw new Error(JSON.stringify(joined));
    state.myJoinedBet = betId;
    console.log(`Expect: "Someone Joined Your Bet!" (Activity on my bets). Tap: the bet. Your balance: $${made.balance}.`);
  },

  async close() {
    if (!state.myJoinedBet) throw new Error('Run "joined" first.');
    // Wait out the deadline rather than editing the bet: a raw update returning only `id`
    // reaches the app's Bet.onUpdate subscription as a null record
    await waitUntil(state.myJoinedBetDeadline);
    await invoke('scheduledbetchecker');
    console.log('Expect: "Pick the Winner" (Disputes & action needed). Tap: the Results tab, listing "Push check: your bet, joined".');
  },

  async results() {
    const rex = await throwaway('Rex Results', 5);
    const betId = randomUUID();
    state.created.push(['bet', betId], ['participant', `${betId}#${rex}`]);
    state.ledgerIds.push(`stake#${betId}#${rex}`);
    const made = await asUser(rex, 'createBetWithStake', form(betId, 'Push check: a bet you joined', { isPrivate: false }));
    if (made.status !== 'created') throw new Error(JSON.stringify(made));
    const joined = await asUser(me(), 'joinBet', { betId, side: 'B', amount: 1 });
    if (joined.status !== 'joined') throw new Error(JSON.stringify(joined));
    // Wait a moment so the join notice and the result arrive as two pushes
    await new Promise((r) => setTimeout(r, 3000));
    const resolved = await asUser(rex, 'resolveBet', { betId, winningSide: 'B' });
    if (resolved.status !== 'resolved') throw new Error(JSON.stringify(resolved));
    console.log('Expect: "Bet Won! (Pending)" (Results & payouts). Tap: the bet.');
  },

  async refund() {
    const betId = randomUUID();
    const made = await asUser(me(), 'createBetWithStake', form(betId, 'Push check: nobody takes this', { deadlineMinutes: 1 }));
    if (made.status !== 'created') throw new Error(JSON.stringify(made));
    await waitUntil(Date.now() + 60_000);
    await invoke('scheduledbetchecker');
    console.log('Expect: "Bet Cancelled" (Cancellations & refunds), stake returned. Tap: the bets list.');
  },

  async reminder() {
    const sam = await throwaway('Sam Squares', 0);
    const eventId = await create('liveEvent', {
      id: `${tag()}-event`, externalId: `${tag()}-event`, sport: 'NFL', homeTeam: 'Push Home', awayTeam: 'Push Away',
      scheduledTime: new Date(Date.now() + 40 * 60_000).toISOString(), status: 'UPCOMING',
    });
    const gameId = await create('squaresGame', {
      id: `${tag()}-squares`, title: 'Push check squares', eventId, creatorId: sam, pricePerSquare: 1, totalPot: 0, squaresSold: 0,
      status: 'ACTIVE', numbersAssigned: false, isPrivate: true, locksAt: new Date(Date.now() + 40 * 60_000).toISOString(),
      payoutStructure: JSON.stringify({ period1: 0.25, period2: 0.25, period3: 0.25, period4: 0.25 }),
    });
    await create('squaresInvitation', { squaresGameId: gameId, fromUserId: sam, toUserId: me(), status: 'PENDING', createdAt: new Date().toISOString() });
    state.squaresGame = gameId;
    await invoke('scheduledsquareschecker');
    console.log('Expect: "Squares Locking Soon" (Reminders). Tap: the squares grid.');
  },

  async squares() {
    if (!state.squaresGame) throw new Error('Run "reminder" first.');
    const bought = await asUser(me(), 'buySquares', { squaresGameId: state.squaresGame, ownerName: 'Me', squares: JSON.stringify([{ row: 4, col: 4 }]) });
    if (bought.status !== 'bought') throw new Error(JSON.stringify(bought));
    console.log('Expect: "Squares Purchased!" (Squares updates). Tap: the squares grid.');
  },

  async money() {
    const u = (await gql('query ($id: ID!) { getUser(id: $id) { balance } }', { id: me() })).getUser;
    const deposit = await create('transaction', {
      userId: me(), type: 'DEPOSIT', status: 'PENDING', amount: 1, balanceBefore: u.balance, balanceAfter: u.balance + 1,
      notes: 'sandbox-push-drive', createdAt: new Date().toISOString(),
    }, { keep: true });
    const decided = await asUser('zz-push-admin', 'adminDecideTransaction', { transactionId: deposit, approve: true }, ['admins']);
    if (decided.status !== 'decided') throw new Error(JSON.stringify(decided));
    console.log('Expect: "Deposit Successful" (Money). Tap: the Wallet.');
  },

  async cleanup() {
    for (const id of state.ledgerIds) state.created.push(['transaction', id]);
    let n = 0;
    for (const [model, id] of [...state.created].reverse()) {
      await gql(`mutation ($input: Delete${cap(model)}Input!) { delete${cap(model)}(input: $input) { id } }`, { input: { id } }).then(() => n++).catch(() => {});
    }
    state.created = [];
    state.ledgerIds = [];
    console.log(`Deleted ${n} throwaway rows. Your own bets, stakes and the $1 deposit stay on the sandbox.`);
  },
};

const step = process.argv[2];
if (!steps[step]) {
  console.error(`Usage: node scripts/sandbox-push-drive.mjs <${Object.keys(steps).join('|')}>`);
  process.exit(1);
}
try {
  await steps[step]();
} finally {
  save();
}
