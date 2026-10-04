/**
 * Ledger logic: how a money movement becomes one atomic DynamoDB write.
 *
 * Every change to a balance goes through the money Lambda, which uses this module to
 * build a single TransactWriteItems request. Pure functions only (no AWS SDK), so the
 * rules are unit tested; the Lambda does the reads, the write and the retries.
 *
 * The rules, each of which closes a hole in the old code (docs/SECURITY_PLAN.md):
 *
 * - Compare-and-swap on the balance. The write succeeds only if the balance is still the
 *   value it was computed from; otherwise the caller re-reads and tries again. The old
 *   code read a balance and wrote balance + amount, so two changes landing together lost
 *   one of them.
 * - One idempotency key per movement. Each ledger row has a deterministic id
 *   (stripe#<paymentIntent>, payout#<participant>, ...) and is written only if it does not
 *   exist, or only if it is still PENDING. A retried webhook or a re-run scheduler is a
 *   no-op, never a second credit.
 * - All or nothing. The balance change, the ledger row and any state change the movement
 *   depends on (a bet becoming RESOLVED, a purchase being refunded) are one transaction.
 * - Never negative. A debit that would take a balance below zero is refused here, and the
 *   compare-and-swap guarantees the balance it was checked against is the one written.
 */

export type LedgerTransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'BET_PLACED'
  | 'BET_WON'
  | 'BET_LOST'
  | 'BET_CANCELLED'
  | 'BET_REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'SQUARES_PURCHASE'
  | 'SQUARES_PAYOUT'
  | 'SQUARES_REFUND';

export type LedgerStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** One money movement for one user. */
export interface LedgerEntry {
  /** Deterministic id of the Transaction row: the idempotency key. */
  transactionId: string;
  userId: string;
  type: LedgerTransactionType;
  /** Signed change to the balance, in dollars. 0 for a record that moves no money. */
  delta: number;
  /** Magnitude shown in the history (gross for winnings, requested for withdrawals). */
  amount: number;
  /** Net amount after fees, where it differs from amount. */
  actualAmount?: number;
  platformFee?: number;
  status: LedgerStatus;
  /**
   * 'create': write a new row; refused if one with this id exists.
   * 'completePending': update an existing row that must still be PENDING (a card deposit
   * the payment-intent function recorded, a payout recorded at resolution).
   * 'upsertPending': complete the row if it is PENDING, or create it if it does not exist.
   */
  mode: 'create' | 'completePending' | 'upsertPending';
  relatedBetId?: string;
  relatedParticipantId?: string;
  relatedSquaresGameId?: string;
  stripePaymentIntentId?: string;
  paymentMethodId?: string;
  notes?: string;
  processedBy?: string;
  failureReason?: string;
}

/**
 * A state change that must happen in the same transaction as the money, guarded by a
 * condition on the item's current state, e.g. a bet PENDING_RESOLUTION -> RESOLVED.
 */
export interface StateUpdate {
  table: TableKey;
  id: string;
  set: Record<string, unknown>;
  /** Attribute -> required current value. A missing attribute can be required with null. */
  expect?: Record<string, unknown>;
  /** Require the item to exist (default true). */
  mustExist?: boolean;
}

export type TableKey = 'User' | 'Transaction' | 'Bet' | 'Participant' | 'SquaresGame' | 'SquaresPurchase';

export type TableNames = Record<TableKey, string>;

export interface LedgerPlanInput {
  entries: LedgerEntry[];
  /** Current balance of every user an entry touches, as just read. */
  balances: Record<string, number>;
  stateUpdates?: StateUpdate[];
  now: string;
}

export interface UserBalanceChange {
  userId: string;
  before: number;
  after: number;
}

export type LedgerPlan =
  | { ok: true; items: TransactItem[]; balances: UserBalanceChange[] }
  | { ok: false; reason: 'INSUFFICIENT_FUNDS'; userId: string; balance: number; required: number }
  | { ok: false; reason: 'UNKNOWN_USER'; userId: string }
  | { ok: false; reason: 'TOO_MANY_ITEMS'; count: number }
  | { ok: false; reason: 'INVALID'; message: string };

/** A TransactWriteItems item in DocumentClient form. */
export type TransactItem =
  | { Put: { TableName: string; Item: Record<string, unknown>; ConditionExpression?: string; ExpressionAttributeNames?: Record<string, string>; ExpressionAttributeValues?: Record<string, unknown> } }
  | { Update: { TableName: string; Key: Record<string, unknown>; UpdateExpression: string; ConditionExpression?: string; ExpressionAttributeNames?: Record<string, string>; ExpressionAttributeValues?: Record<string, unknown> } };

/** DynamoDB's limit on items in one TransactWriteItems call. */
export const MAX_TRANSACT_ITEMS = 100;

/** Money is dollars with two decimals; floating-point drift is rounded off at every step. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function roundMoney(dollars: number): number {
  return toCents(dollars) / 100;
}

/**
 * Build the atomic write for a set of movements, or say why it cannot happen.
 *
 * Several entries for one user are combined into a single balance update: DynamoDB allows
 * one operation per item per transaction.
 */
export function planLedgerWrite(input: LedgerPlanInput, tables: TableNames): LedgerPlan {
  const { entries, balances, stateUpdates = [], now } = input;

  // DynamoDB allows one operation per item per transaction
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.transactionId)) {
      return { ok: false, reason: 'INVALID', message: `Duplicate transaction id ${entry.transactionId}` };
    }
    ids.add(entry.transactionId);
    if (!Number.isFinite(entry.delta) || !Number.isFinite(entry.amount) || entry.amount < 0) {
      return { ok: false, reason: 'INVALID', message: `Bad amount on ${entry.transactionId}` };
    }
  }
  const touchedUsers = new Set(entries.map((e) => e.userId));
  for (const update of stateUpdates) {
    // The user's row is already in the transaction as its balance update
    if (update.table === 'User' && touchedUsers.has(update.id)) {
      return { ok: false, reason: 'INVALID', message: `State update on user ${update.id} whose balance also changes` };
    }
  }

  // Net change per user, in cents
  const deltaCents = new Map<string, number>();
  for (const entry of entries) {
    deltaCents.set(entry.userId, (deltaCents.get(entry.userId) ?? 0) + toCents(entry.delta));
  }

  const changes: UserBalanceChange[] = [];
  for (const [userId, cents] of deltaCents) {
    if (!(userId in balances)) return { ok: false, reason: 'UNKNOWN_USER', userId };
    const before = roundMoney(balances[userId]);
    const after = (toCents(before) + cents) / 100;
    if (after < 0) {
      return { ok: false, reason: 'INSUFFICIENT_FUNDS', userId, balance: before, required: -cents / 100 };
    }
    changes.push({ userId, before, after });
  }

  // Running balance per user, so each ledger row records the balance it moved from/to
  const running = new Map(changes.map((c) => [c.userId, c.before]));

  const items: TransactItem[] = [];

  for (const change of changes) {
    if (change.before === change.after) continue; // a $0 record needs no balance write
    items.push({
      Update: {
        TableName: tables.User,
        Key: { id: change.userId },
        UpdateExpression: 'SET #balance = :after, #updatedAt = :now',
        // Compare-and-swap: only if the balance is still what the plan was built from.
        // A missing balance attribute is the schema default of 0.
        ConditionExpression:
          change.before === 0
            ? 'attribute_exists(#id) AND (#balance = :before OR attribute_not_exists(#balance))'
            : 'attribute_exists(#id) AND #balance = :before',
        ExpressionAttributeNames: { '#id': 'id', '#balance': 'balance', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: { ':before': change.before, ':after': change.after, ':now': now },
      },
    });
  }

  for (const entry of entries) {
    const before = running.get(entry.userId) ?? roundMoney(balances[entry.userId] ?? 0);
    const after = (toCents(before) + toCents(entry.delta)) / 100;
    running.set(entry.userId, after);
    items.push(transactionItem(entry, before, after, now, tables.Transaction));
  }

  for (const update of stateUpdates) {
    items.push(stateUpdateItem(update, now, tables));
  }

  if (items.length > MAX_TRANSACT_ITEMS) {
    return { ok: false, reason: 'TOO_MANY_ITEMS', count: items.length };
  }

  return { ok: true, items, balances: changes };
}

/** The Transaction row for an entry, with the idempotency condition for its mode. */
function transactionItem(
  entry: LedgerEntry,
  balanceBefore: number,
  balanceAfter: number,
  now: string,
  table: string
): TransactItem {
  const fields: Record<string, unknown> = withoutUndefined({
    userId: entry.userId,
    type: entry.type,
    status: entry.status,
    amount: roundMoney(entry.amount),
    actualAmount: entry.actualAmount === undefined ? undefined : roundMoney(entry.actualAmount),
    platformFee: roundMoney(entry.platformFee ?? 0),
    balanceBefore,
    balanceAfter,
    relatedBetId: entry.relatedBetId,
    relatedParticipantId: entry.relatedParticipantId,
    relatedSquaresGameId: entry.relatedSquaresGameId,
    stripePaymentIntentId: entry.stripePaymentIntentId,
    paymentMethodId: entry.paymentMethodId,
    notes: entry.notes,
    processedBy: entry.processedBy,
    failureReason: entry.failureReason,
    completedAt: entry.status === 'COMPLETED' || entry.status === 'FAILED' ? now : undefined,
    updatedAt: now,
  });

  if (entry.mode === 'create') {
    return {
      Put: {
        TableName: table,
        Item: { id: entry.transactionId, __typename: 'Transaction', createdAt: now, ...fields },
        ConditionExpression: 'attribute_not_exists(#id)',
        ExpressionAttributeNames: { '#id': 'id' },
      },
    };
  }

  // completePending / upsertPending: update in place, keeping createdAt (the history's
  // sort key) from the original row
  const names: Record<string, string> = { '#id': 'id', '#status': 'status' };
  const values: Record<string, unknown> = { ':pending': 'PENDING' };
  const sets: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    names[`#${key}`] = key;
    values[`:${key}`] = value;
    sets.push(`#${key} = :${key}`);
  }
  if (entry.mode === 'upsertPending') {
    names['#createdAt'] = 'createdAt';
    names['#typename'] = '__typename';
    values[':now'] = now;
    values[':typename'] = 'Transaction';
    sets.push('#createdAt = if_not_exists(#createdAt, :now)', '#typename = if_not_exists(#typename, :typename)');
  }

  return {
    Update: {
      TableName: table,
      Key: { id: entry.transactionId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression:
        entry.mode === 'completePending'
          ? 'attribute_exists(#id) AND #status = :pending'
          : 'attribute_not_exists(#id) OR #status = :pending',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

function stateUpdateItem(update: StateUpdate, now: string, tables: TableNames): TransactItem {
  const names: Record<string, string> = { '#id': 'id', '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':now': now };
  const sets = ['#updatedAt = :now'];
  for (const [key, value] of Object.entries(update.set)) {
    names[`#s_${key}`] = key;
    values[`:s_${key}`] = value;
    sets.push(`#s_${key} = :s_${key}`);
  }
  const conditions: string[] = update.mustExist === false ? [] : ['attribute_exists(#id)'];
  for (const [key, value] of Object.entries(update.expect ?? {})) {
    names[`#e_${key}`] = key;
    if (value === null) {
      conditions.push(`attribute_not_exists(#e_${key})`);
    } else {
      values[`:e_${key}`] = value;
      conditions.push(`#e_${key} = :e_${key}`);
    }
  }
  return {
    Update: {
      TableName: tables[update.table],
      Key: { id: update.id },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ...(conditions.length ? { ConditionExpression: conditions.join(' AND ') } : {}),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

function withoutUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined));
}

/**
 * Why a TransactWriteItems call was cancelled, from its CancellationReasons (one per item,
 * in order). 'balance_changed': a compare-and-swap lost, so re-read and retry.
 * 'already_applied': the ledger row exists or is no longer PENDING, so this movement
 * happened before (a retry). 'state_changed': a guarded state moved on (the bet was
 * already resolved), so stop.
 */
export function classifyCancellation(
  plan: Extract<LedgerPlan, { ok: true }>,
  reasons: Array<{ Code?: string } | undefined>,
  tables: TableNames
): 'balance_changed' | 'already_applied' | 'state_changed' | 'other' {
  let sawBalance = false;
  let sawLedger = false;
  let sawState = false;
  plan.items.forEach((item, index) => {
    if (reasons[index]?.Code !== 'ConditionalCheckFailed') return;
    const table = 'Put' in item ? item.Put.TableName : item.Update.TableName;
    if (table === tables.User) sawBalance = true;
    else if (table === tables.Transaction) sawLedger = true;
    else sawState = true;
  });
  // A replayed movement fails on its ledger row; its balance check may fail too (the
  // balance has moved on since), but the ledger row is the answer.
  if (sawLedger) return 'already_applied';
  if (sawState) return 'state_changed';
  if (sawBalance) return 'balance_changed';
  return 'other';
}

/** What applying movements came to (the money function's ledgerApply result). */
export type LedgerResult =
  | { status: 'applied'; balances: UserBalanceChange[] }
  | { status: 'already_applied' }
  | { status: 'state_changed' }
  | { status: 'insufficient_funds'; userId: string; balance: number; required: number }
  | { status: 'rejected'; reason: string };
