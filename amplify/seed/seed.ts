/**
 * Seed the sandbox with enough live data to exercise the join feed at scale.
 *
 * Run with: npx ampx sandbox seed
 *
 * Writes straight to DynamoDB rather than through AppSync. Going through
 * GraphQL would be one mutation per row and needs a signed-in Cognito user;
 * BatchWriteItem does 25 at a time with the caller's AWS credentials. The rows
 * are still readable by the app because Bet grants
 * `authenticated().to(['read'])` unconditionally — it does not depend on the
 * owner field, which raw writes cannot populate.
 *
 * Consequence worth knowing: seeded rows have no `owner`, so owner-scoped
 * mutations (delete, and update via the owner rule) will not apply to them.
 * They are fine for reading, listing, filtering and joining, which is what the
 * scale test exercises. See README.md in this directory.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  CloudFormationClient,
  ListStackResourcesCommand,
} from '@aws-sdk/client-cloudformation';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  type BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTPUTS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'amplify_outputs.json'), 'utf8')
);
const REGION: string = OUTPUTS.data.aws_region;

/** Volume and shape of the generated data. */
const BET_COUNT = Number(process.env.SEED_BET_COUNT ?? 2000);
const FRIEND_COUNT = Number(process.env.SEED_FRIEND_COUNT ?? 5);
const STRANGER_COUNT = Number(process.env.SEED_STRANGER_COUNT ?? 25);
/** Roughly what share of bets come from a friend rather than a stranger. */
const FRIEND_BET_RATIO = Number(process.env.SEED_FRIEND_BET_RATIO ?? 0.25);
const DEADLINE_MIN_DAYS = Number(process.env.SEED_DEADLINE_MIN_DAYS ?? 3);
const DEADLINE_MAX_DAYS = Number(process.env.SEED_DEADLINE_MAX_DAYS ?? 7);

/**
 * Cognito sub of the account you sign in as.
 *
 * Required to create friendships, because a bet is only a *friend's* bet
 * relative to somebody. Without it the script still seeds bets, but every one
 * belongs to a stranger and the Join tab — which opens on its Friends view —
 * looks empty until you switch to All.
 */
const VIEWER_ID = process.env.SEED_USER_ID ?? '';

/** Marks every seeded row so it can be found and removed again. */
const SEED_TAG = 'seed:scale-test';

const TEAMS: Array<[string, string]> = [
  ['Chiefs', 'Bills'],
  ['Lakers', 'Celtics'],
  ['Yankees', 'Red Sox'],
  ['Arsenal', 'Chelsea'],
  ['Packers', 'Bears'],
  ['Heat', 'Knicks'],
];
const CATEGORIES = ['SPORTS', 'ENTERTAINMENT', 'WEATHER', 'STOCKS', 'CUSTOM'];
const FIRST = ['Casey', 'Jordan', 'Riley', 'Avery', 'Quinn', 'Rowan', 'Sage', 'Emery'];
const LAST = ['Rivera', 'Chen', 'Okafor', 'Novak', 'Haddad', 'Lindqvist'];

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const cfn = new CloudFormationClient({ region: REGION });

/**
 * Resolve the physical table from the sandbox stack, not by matching names.
 *
 * This account has three `Bet-*` tables — production and sandboxes — differing
 * only by an opaque api id, and that id is *not* the AppSync hostname prefix.
 * An early version guessed from the hostname and would have written thousands
 * of test rows into the wrong environment. Walking the stack makes that
 * impossible: the only tables reachable are ones this stack owns.
 */
const STACK_NAME =
  process.env.SEED_STACK_NAME ?? 'amplify-sidebet-Desktop-sandbox-a3098e7c95';

let tableCache: Promise<string[]> | null = null;

/**
 * Walk once and cache. Looking each model up independently meant traversing
 * the whole nested stack tree once per model, in parallel, which CloudFormation
 * throttles ("Rate exceeded") before any row is written.
 */
function listTables(): Promise<string[]> {
  // Cache the promise, not the result: the three lookups run concurrently, so
  // caching only the resolved value still lets all three start their own walk.
  if (!tableCache) tableCache = walkStack();
  return tableCache;
}

async function walkStack(): Promise<string[]> {
  const tables: string[] = [];

  // Nested stacks: data resources sit several levels below the root.
  const walk = async (stackName: string, depth: number): Promise<void> => {
    if (depth > 4) return;
    let NextToken: string | undefined;
    do {
      const page = await cfn.send(
        new ListStackResourcesCommand({ StackName: stackName, NextToken })
      );
      for (const r of page.StackResourceSummaries ?? []) {
        // Amplify Gen2 provisions tables through a custom resource, so they are
        // Custom::AmplifyDynamoDBTable rather than AWS::DynamoDB::Table.
        const isTable =
          r.ResourceType === 'AWS::DynamoDB::Table' ||
          r.ResourceType === 'Custom::AmplifyDynamoDBTable';
        if (isTable && r.PhysicalResourceId) {
          tables.push(r.PhysicalResourceId);
        } else if (
          r.ResourceType === 'AWS::CloudFormation::Stack' &&
          r.PhysicalResourceId
        ) {
          await walk(r.PhysicalResourceId, depth + 1);
        }
      }
      NextToken = page.NextToken;
    } while (NextToken);
  };

  await walk(STACK_NAME, 0);
  return tables;
}

async function findTable(model: string): Promise<string> {
  const tables = await listTables();
  const matches = tables.filter((t) => t.startsWith(`${model}-`));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one "${model}" table in stack ${STACK_NAME}, found ` +
        `${matches.length}: ${matches.join(', ') || '(none)'}. Refusing to guess.`
    );
  }
  return matches[0];
}

const friendId = (i: number) => `seed-friend-${String(i).padStart(3, '0')}`;
const strangerId = (i: number) => `seed-stranger-${String(i).padStart(3, '0')}`;

function makeUser(id: string, index: number) {
  const name = `${FIRST[index % FIRST.length]} ${LAST[index % LAST.length]}`;
  const now = new Date().toISOString();
  return {
    id,
    username: id,
    email: `${id}@seed.invalid`,
    displayName: name,
    displayNameLower: name.toLowerCase(),
    isPublic: true,
    role: 'USER',
    balance: 500,
    trustScore: 5,
    onboardingCompleted: true,
    createdAt: now,
    updatedAt: now,
    __typename: 'User',
  };
}

/**
 * Friendship stores the pair sorted, user1Id lexicographically smaller, and the
 * feed queries friendshipsByUser1 and friendshipsByUser2 then takes whichever
 * side is not the viewer. Sorting here rather than assuming an order keeps the
 * lookup correct whatever the viewer's id happens to be.
 */
function makeFriendship(viewer: string, friend: string) {
  const [user1Id, user2Id] = [viewer, friend].sort();
  const now = new Date().toISOString();
  return {
    id: `seed-friendship-${friend}`,
    user1Id,
    user2Id,
    createdAt: now,
    updatedAt: now,
    __typename: 'Friendship',
  };
}

function makeBet(index: number, creatorId: string, creatorName: string) {
  const [home, away] = TEAMS[index % TEAMS.length];
  const now = Date.now();
  const spanDays = DEADLINE_MAX_DAYS - DEADLINE_MIN_DAYS;
  const deadlineDays = DEADLINE_MIN_DAYS + Math.random() * spanDays;
  const stake = [5, 10, 25, 50, 100][index % 5];

  return {
    id: `seed-bet-${String(index).padStart(6, '0')}`,
    title: `${home} vs ${away} #${index}`,
    description: `${SEED_TAG} — generated for join feed scale testing`,
    category: CATEGORIES[index % CATEGORIES.length],
    status: 'ACTIVE',
    creatorId,
    creatorName,
    betAmount: stake,
    totalPot: stake,
    odds: JSON.stringify({ sideAName: home, sideBName: away }),
    // Days out, so seeded bets stay live long enough to be worth poking at.
    deadline: new Date(now + deadlineDays * 86_400_000).toISOString(),
    isPrivate: false,
    sideACount: 1,
    sideBCount: 0,
    // The creator only. The viewer is deliberately absent, so every seeded bet
    // is joinable — a bet you are already in is filtered out of the feed.
    participantUserIds: [creatorId],
    // Must be false. isTestBet means "exclude from real bet lists" and
    // BetDataContext drops those rows outright, so seeding them true made the
    // join feed render empty while the tab badge still counted 20. Seeded rows
    // stay identifiable by their seed-bet- ids and the tag in description.
    isTestBet: false,
    // Spread createdAt backwards so ordering is stable and DESC sorting is
    // observable rather than every row sharing one timestamp.
    createdAt: new Date(now - index * 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    __typename: 'Bet',
  };
}

/**
 * The SDK's own request shape. Hand-rolling this as `{ Item: unknown }` is what
 * broke the Amplify backend build: everything under amplify/ is type-checked
 * with `strict` on by `amplify/tsconfig.json`, while `npm run typecheck` covers
 * only src/ and App.tsx and so cannot see it. Run `npm run typecheck:backend`.
 */
type WriteRequests = NonNullable<BatchWriteCommandInput['RequestItems']>;

/** BatchWrite in chunks of 25, retrying only what DynamoDB hands back. */
async function writeAll(table: string, items: Array<Record<string, any>>) {
  for (let start = 0; start < items.length; start += 25) {
    let request: WriteRequests = {
      [table]: items.slice(start, start + 25).map((Item) => ({ PutRequest: { Item } })),
    };
    // BatchWrite can partially succeed; retry only the leftovers, backing off.
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await ddb.send(new BatchWriteCommand({ RequestItems: request }));
      const unprocessed = result.UnprocessedItems ?? {};
      if (!unprocessed[table]?.length) break;
      request = unprocessed;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 100));
    }
  }
}

async function main() {
  const [betTable, userTable, friendshipTable] = await Promise.all([
    findTable('Bet'),
    findTable('User'),
    findTable('Friendship'),
  ]);

  const friends = Array.from({ length: FRIEND_COUNT }, (_, i) => friendId(i));
  const strangers = Array.from({ length: STRANGER_COUNT }, (_, i) => strangerId(i));

  const users = [
    ...friends.map((id, i) => makeUser(id, i)),
    ...strangers.map((id, i) => makeUser(id, i + FRIEND_COUNT)),
  ];
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));

  console.log(
    `Users:       ${users.length} (${friends.length} friends, ${strangers.length} strangers)`
  );
  await writeAll(userTable, users);

  if (VIEWER_ID) {
    const friendships = friends.map((f) => makeFriendship(VIEWER_ID, f));
    console.log(`Friendships: ${friendships.length} linking viewer ${VIEWER_ID}`);
    await writeAll(friendshipTable, friendships);
  } else {
    console.warn(
      'Friendships: SKIPPED. Set SEED_USER_ID to your Cognito sub, otherwise\n' +
        '             the Join tab is empty on its default Friends view.'
    );
  }

  const everyNth = Math.max(1, Math.round(1 / FRIEND_BET_RATIO));
  const bets = Array.from({ length: BET_COUNT }, (_, i) => {
    const fromFriend = friends.length > 0 && i % everyNth === 0;
    const pool = fromFriend ? friends : strangers;
    const creator = pool[i % pool.length];
    return makeBet(i, creator, nameById.get(creator) ?? 'Seed User');
  });
  const friendBets = bets.filter((b) => friends.includes(b.creatorId)).length;

  console.log(`Bets:        ${bets.length} (${friendBets} from friends) into ${betTable}`);
  console.log(`Deadlines:   ${DEADLINE_MIN_DAYS}-${DEADLINE_MAX_DAYS} days out, all ACTIVE`);
  await writeAll(betTable, bets);

  console.log(`Done. Everything tagged "${SEED_TAG}".`);
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
