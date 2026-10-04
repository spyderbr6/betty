/**
 * Sandbox check for the money function (docs/SECURITY_PLAN.md).
 *
 * Calls the internal ledgerApply mutation over IAM with your local AWS profile, the same
 * path our Lambdas use, and checks the ledger's guarantees against the real tables:
 *   - ten simultaneous credits to one user all land (no lost updates)
 *   - replaying a movement is a no-op (idempotency)
 *   - a debit beyond the balance is refused
 *
 * Writes a throwaway User row and ledger rows, then deletes them.
 *
 * Run against the sandbox ONLY:
 *   SANDBOX_STACK=amplify-sidebet-Desktop-sandbox-a3098e7c95 node scripts/sandbox-money-check.mjs
 * It reads amplify_outputs.json (which the sandbox writes) and refuses to run unless that
 * endpoint belongs to the named sandbox stack.
 */

import { readFileSync } from 'node:fs';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';

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
const outputsText = JSON.stringify(Stacks[0].Outputs ?? []);
const apiId = new URL(endpoint).hostname.split('.')[0];
if (!outputsText.includes(apiId)) {
  console.error(`Refusing: ${endpoint} is not an output of ${stackName}.`);
  process.exit(1);
}
console.log(`Sandbox ${stackName}: ${endpoint}\n`);

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

const ledgerApply = async (entries) => {
  const data = await gql(
    'mutation ($entries: AWSJSON!) { ledgerApply(entries: $entries) }',
    { entries: JSON.stringify(entries) }
  );
  return JSON.parse(data.ledgerApply);
};

const getBalance = async (id) => (await gql('query ($id: ID!) { getUser(id: $id) { balance } }', { id })).getUser?.balance;

const credit = (userId, id, amount) => ({
  transactionId: id,
  userId,
  type: 'ADMIN_ADJUSTMENT',
  delta: amount,
  amount,
  status: 'COMPLETED',
  mode: 'create',
  notes: 'sandbox-money-check',
});

// --- run ----------------------------------------------------------------------------
const userId = `zz-money-check-${Date.now()}`;
const ledgerIds = [];
let failures = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!pass) failures++;
};

try {
  await gql(
    'mutation ($input: CreateUserInput!) { createUser(input: $input) { id } }',
    { input: { id: userId, username: userId, email: `${userId}@example.invalid`, balance: 0 } }
  );

  // 1. Ten simultaneous credits
  const ids = Array.from({ length: 10 }, (_, i) => `zz-check#${userId}#${i}`);
  ledgerIds.push(...ids);
  const results = await Promise.all(ids.map((id) => ledgerApply([credit(userId, id, 1)])));
  const balance1 = await getBalance(userId);
  check('ten simultaneous $1 credits all land', balance1 === 10, `balance ${balance1}, results ${results.map((r) => r.status).join(',')}`);

  // 2. Replay
  const replay = await ledgerApply([credit(userId, ids[0], 1)]);
  const balance2 = await getBalance(userId);
  check('replaying a credit is a no-op', replay.status === 'already_applied' && balance2 === 10, `${replay.status}, balance ${balance2}`);

  // 3. Overdraft
  const debitId = `zz-check#${userId}#debit`;
  const overdraft = await ledgerApply([{ ...credit(userId, debitId, 0), type: 'BET_PLACED', delta: -11, amount: 11 }]);
  const balance3 = await getBalance(userId);
  check('a debit beyond the balance is refused', overdraft.status === 'insufficient_funds' && balance3 === 10, `${overdraft.status}, balance ${balance3}`);

  // 4. Exact debit to zero
  ledgerIds.push(debitId);
  const exact = await ledgerApply([{ ...credit(userId, debitId, 0), type: 'BET_PLACED', delta: -10, amount: 10 }]);
  const balance4 = await getBalance(userId);
  check('a debit of the whole balance goes through', exact.status === 'applied' && balance4 === 0, `${exact.status}, balance ${balance4}`);
} catch (error) {
  console.error('ERROR', error.message ?? error);
  failures++;
} finally {
  for (const id of ledgerIds) {
    await gql('mutation ($input: DeleteTransactionInput!) { deleteTransaction(input: $input) { id } }', { input: { id } }).catch(() => {});
  }
  await gql('mutation ($input: DeleteUserInput!) { deleteUser(input: $input) { id } }', { input: { id: userId } }).catch((e) =>
    console.warn('Could not delete test user', userId, e.message)
  );
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
