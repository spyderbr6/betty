import type { Context } from 'aws-lambda';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { planExpiry } from './backfillLogic';

/**
 * One-off backfill: set `expiresAt` (and `category`, where missing) on every Notification
 * row that predates TTL, so DynamoDB removes old notifications like it does new ones.
 *
 * Run it from the Lambda console with a test event:
 *   {"dryRun": true}   counts what it would change, writes nothing
 *   {}                 does it
 * It stops early if time runs low and says so (`done: false`); just run it again. Every
 * run picks up only rows still missing `expiresAt`, so re-running is always safe.
 *
 * Writes go straight to DynamoDB, not through AppSync. An AppSync update would fire the
 * app's Notification onUpdate subscription, which counts any update to an unread
 * notification as a new unread one and would inflate badges for users online at the time.
 * Direct writes fire nothing; the dispatcher's stream mapping only acts on INSERTs.
 */

const TABLE = process.env.NOTIFICATION_TABLE_NAME;
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** Stop scanning with this much time left, so a run always reports where it got to. */
const SAFETY_MARGIN_MS = 60_000;
const PAGE_SIZE = 500;
const WRITE_CONCURRENCY = 25;

interface BackfillEvent {
  dryRun?: boolean;
}

interface BackfillResult {
  dryRun: boolean;
  scanned: number;
  updated: number;
  /** Rows whose expiry is already past: TTL deletes them within about 48 hours of the write. */
  alreadyExpired: number;
  /** Rows that gained an expiresAt between the scan and the write (e.g. written by a newer client). */
  skipped: number;
  done: boolean;
}

export const handler = async (event: BackfillEvent | null, context: Context): Promise<BackfillResult> => {
  if (!TABLE) {
    throw new Error('NOTIFICATION_TABLE_NAME is not set');
  }
  const dryRun = event?.dryRun === true;
  const now = new Date();
  const result: BackfillResult = { dryRun, scanned: 0, updated: 0, alreadyExpired: 0, skipped: 0, done: false };

  let startKey: Record<string, unknown> | undefined;
  do {
    if (context.getRemainingTimeInMillis() < SAFETY_MARGIN_MS) {
      console.log('[Backfill] Stopping early to stay inside the timeout; run again to continue.', result);
      return result;
    }

    // A full, paginated Scan is right here: this is a one-off over the whole table, not a
    // lookup. The filter applies after reading, so pages can come back empty until done.
    const page = await db.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: 'attribute_not_exists(expiresAt)',
        ProjectionExpression: 'id, #type, createdAt, #category',
        ExpressionAttributeNames: { '#type': 'type', '#category': 'category' },
        ExclusiveStartKey: startKey,
        Limit: PAGE_SIZE,
      })
    );
    const rows = page.Items ?? [];
    result.scanned += rows.length;

    for (let i = 0; i < rows.length; i += WRITE_CONCURRENCY) {
      await Promise.all(rows.slice(i, i + WRITE_CONCURRENCY).map((row) => backfillRow(row, now, dryRun, result)));
    }

    startKey = page.LastEvaluatedKey;
  } while (startKey);

  result.done = true;
  console.log('[Backfill] Complete:', result);
  return result;
};

async function backfillRow(
  row: Record<string, unknown>,
  now: Date,
  dryRun: boolean,
  result: BackfillResult
): Promise<void> {
  const plan = planExpiry(row, now);
  if (plan.alreadyExpired) result.alreadyExpired++;
  if (dryRun) {
    result.updated++;
    return;
  }

  const values: Record<string, unknown> = { ':expiresAt': plan.expiresAt };
  let update = 'SET expiresAt = :expiresAt';
  if (plan.category) {
    update += ', #category = if_not_exists(#category, :category)';
    values[':category'] = plan.category;
  }

  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id: row.id },
        UpdateExpression: update,
        // Never overwrite an expiry written since the scan, and never create a row that
        // was deleted in the meantime (UpdateItem would otherwise upsert).
        ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(expiresAt)',
        ExpressionAttributeNames: plan.category ? { '#category': 'category' } : undefined,
        ExpressionAttributeValues: values,
      })
    );
    result.updated++;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      result.skipped++;
      return;
    }
    throw error;
  }
}
