import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'aws-lambda';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

/**
 * The handler against an in-memory stand-in for the Notification table. Unlike most
 * handlers this one has no top-level Amplify setup, so it can be imported directly.
 *
 * The fake follows DynamoDB where it matters: Scan applies its filter *after* reading a
 * page (so pages can be short or empty while more remain), and UpdateItem enforces the
 * ConditionExpression.
 */

type Row = Record<string, unknown> & { id: string };
let table: Row[] = [];
/** Called before each UpdateItem is applied, so a test can change the row underneath it. */
let beforeUpdate: (id: string) => void = () => {};

/** The parts of Scan and UpdateItem inputs the fake reads. */
interface FakeInput {
  Limit: number;
  ExclusiveStartKey?: { id: string };
  Key: { id: string };
  ConditionExpression?: string;
  ExpressionAttributeValues: Record<string, unknown>;
}

const fakeSend = vi.fn(async (command: { input: FakeInput; constructor: { name: string } }) => {
  const input = command.input;
  if (command.constructor.name === 'ScanCommand') {
    const startId = input.ExclusiveStartKey?.id;
    const start = startId ? table.findIndex((r) => r.id === startId) + 1 : 0;
    const page = table.slice(start, start + input.Limit);
    const more = start + input.Limit < table.length;
    return {
      Items: page.filter((r) => r.expiresAt === undefined).map((r) => ({ ...r })),
      LastEvaluatedKey: more ? { id: page[page.length - 1].id } : undefined,
    };
  }
  if (command.constructor.name === 'UpdateCommand') {
    beforeUpdate(input.Key.id);
    // Enforce only the conditions the handler actually sent; without them, UpdateItem
    // overwrites, and creates the row if it is missing — as DynamoDB does.
    const condition: string = input.ConditionExpression ?? '';
    let row = table.find((r) => r.id === input.Key.id);
    const failed =
      (condition.includes('attribute_exists(id)') && !row) ||
      (condition.includes('attribute_not_exists(expiresAt)') && row?.expiresAt !== undefined);
    if (failed) {
      throw new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} });
    }
    if (!row) {
      row = { id: input.Key.id };
      table.push(row);
    }
    row.expiresAt = input.ExpressionAttributeValues[':expiresAt'];
    if (input.ExpressionAttributeValues[':category'] && row.category === undefined) {
      row.category = input.ExpressionAttributeValues[':category'];
    }
    return {};
  }
  throw new Error(`Unexpected command ${command.constructor.name}`);
});

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
  return { ...actual, DynamoDBDocumentClient: { from: () => ({ send: fakeSend }) } };
});

vi.stubEnv('NOTIFICATION_TABLE_NAME', 'Notification-test');
const { handler } = await import('../handler');

const context = (remainingMs = 600_000) => ({ getRemainingTimeInMillis: () => remainingMs }) as unknown as Context;

const row = (id: string, over: Record<string, unknown> = {}): Row => ({
  id,
  type: 'BET_JOINED',
  createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  ...over,
});

beforeEach(() => {
  table = [];
  beforeUpdate = () => {};
  fakeSend.mockClear();
});

describe('notification expiry backfill', () => {
  it('stamps every row that has no expiry, across many pages, and leaves stamped rows alone', async () => {
    table = Array.from({ length: 1234 }, (_, i) => row(`n-${i}`));
    table[5].expiresAt = 111; // already has one
    table[6].category = 'MY_BET_ACTIVITY';

    const result = await handler({}, context());

    expect(result).toMatchObject({ dryRun: false, scanned: 1233, updated: 1233, skipped: 0, done: true });
    expect(table.every((r) => typeof r.expiresAt === 'number')).toBe(true);
    expect(table[5].expiresAt).toBe(111);
    expect(table[0].category).toBe('MY_BET_ACTIVITY');
  });

  it('writes nothing on a dry run, but reports what it would do', async () => {
    table = [row('a'), row('b', { createdAt: '2025-01-01T00:00:00Z' })];

    const result = await handler({ dryRun: true }, context());

    expect(result).toMatchObject({ dryRun: true, scanned: 2, updated: 2, alreadyExpired: 1, done: true });
    expect(table.some((r) => 'expiresAt' in r)).toBe(false);
    expect(fakeSend.mock.calls.every(([c]) => c.constructor.name === 'ScanCommand')).toBe(true);
  });

  it('gives long-expired rows an expiry in the past, which is how TTL removes them', async () => {
    table = [row('old', { createdAt: '2025-01-01T00:00:00Z' })];

    const result = await handler({}, context());

    expect(result.alreadyExpired).toBe(1);
    expect(table[0].expiresAt as number).toBeLessThan(Date.now() / 1000);
  });

  it('skips a row that gained an expiry, or was deleted, after the scan read it', async () => {
    table = [row('raced'), row('deleted'), row('fine')];
    beforeUpdate = (id) => {
      if (id === 'raced') table[0].expiresAt = 999;
      if (id === 'deleted') table = table.filter((r) => r.id !== 'deleted');
    };

    const result = await handler({}, context());

    expect(result).toMatchObject({ updated: 1, skipped: 2, done: true });
    expect(table.find((r) => r.id === 'raced')!.expiresAt).toBe(999);
    expect(table.find((r) => r.id === 'deleted')).toBeUndefined();
  });

  it('stops before the timeout and says it is not done; a second run finishes the job', async () => {
    table = Array.from({ length: 1200 }, (_, i) => row(`n-${i}`));
    let budget = 2; // enough time for two pages
    const tight = { getRemainingTimeInMillis: () => (budget-- > 0 ? 600_000 : 30_000) } as unknown as Context;

    const first = await handler({}, tight);
    expect(first.done).toBe(false);
    expect(first.updated).toBe(1000);

    const second = await handler({}, context());
    expect(second).toMatchObject({ updated: 200, done: true });
    expect(table.every((r) => typeof r.expiresAt === 'number')).toBe(true);
  });

  it('surfaces errors other than a failed condition, rather than reporting success', async () => {
    table = [row('a')];
    beforeUpdate = () => {
      throw new Error('ProvisionedThroughputExceededException');
    };

    await expect(handler({}, context())).rejects.toThrow('ProvisionedThroughputExceededException');
  });
});
