/**
 * Runs a ledger plan (amplify/shared/ledgerLogic.ts) against DynamoDB.
 *
 * Reads the balances the plan needs, writes everything in one TransactWriteItems call, and
 * on a lost compare-and-swap re-reads and tries again. A movement whose ledger row already
 * exists (a retry) is reported as already applied rather than as an error, which is what
 * makes every caller safe to re-run.
 */

import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand, DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  classifyCancellation,
  planLedgerWrite,
  type LedgerEntry,
  type StateUpdate,
  type LedgerResult,
  type TableNames,
} from '../../shared/ledgerLogic';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export function tableNames(): TableNames {
  const names = {
    User: process.env.USER_TABLE,
    Transaction: process.env.TRANSACTION_TABLE,
    Bet: process.env.BET_TABLE,
    Participant: process.env.PARTICIPANT_TABLE,
    SquaresGame: process.env.SQUARES_GAME_TABLE,
    SquaresPurchase: process.env.SQUARES_PURCHASE_TABLE,
  };
  for (const [key, value] of Object.entries(names)) {
    if (!value) throw new Error(`Missing table name for ${key}`);
  }
  return names as TableNames;
}

const MAX_ATTEMPTS = 5;

/**
 * Apply movements (and any guarded state changes) atomically.
 *
 * 'applied': done. 'already_applied': these ledger rows were written before; nothing
 * changed. 'state_changed': a guarded state moved on (e.g. the bet is no longer awaiting
 * payout); nothing changed. 'insufficient_funds': refused; nothing changed.
 */
export async function applyLedger(entries: LedgerEntry[], stateUpdates: StateUpdate[] = []): Promise<LedgerResult> {
  const tables = tableNames();
  const userIds = [...new Set(entries.map((e) => e.userId))];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const balances = await readBalances(userIds, tables.User);
    const plan = planLedgerWrite({ entries, balances, stateUpdates, now: new Date().toISOString() }, tables);

    if (!plan.ok) {
      if (plan.reason === 'INSUFFICIENT_FUNDS') {
        return { status: 'insufficient_funds', userId: plan.userId, balance: plan.balance, required: plan.required };
      }
      return { status: 'rejected', reason: plan.reason === 'INVALID' ? plan.message : plan.reason };
    }

    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: plan.items }));
      return { status: 'applied', balances: plan.balances };
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const outcome = classifyCancellation(plan, error.CancellationReasons ?? [], tables);
      if (outcome === 'already_applied') return { status: 'already_applied' };
      if (outcome === 'state_changed') return { status: 'state_changed' };
      // balance_changed (another write landed in between) or a transient conflict: retry
      // with fresh balances after a short, growing pause
      console.warn(`[Ledger] Attempt ${attempt} cancelled (${outcome}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt + Math.random() * 50));
    }
  }

  throw new Error(`Ledger write did not settle after ${MAX_ATTEMPTS} attempts`);
}

/** Current balance per user. A user with no row is absent, which the plan refuses. */
async function readBalances(userIds: string[], table: string): Promise<Record<string, number>> {
  const balances: Record<string, number> = {};
  // BatchGet takes at most 100 keys
  for (let i = 0; i < userIds.length; i += 100) {
    let keys: Record<string, unknown>[] | undefined = userIds.slice(i, i + 100).map((id) => ({ id }));
    while (keys && keys.length) {
      const result = await ddb.send(
        new BatchGetCommand({
          RequestItems: { [table]: { Keys: keys, ProjectionExpression: '#id, #balance', ExpressionAttributeNames: { '#id': 'id', '#balance': 'balance' } } },
        })
      );
      for (const item of result.Responses?.[table] ?? []) {
        balances[item.id as string] = typeof item.balance === 'number' ? item.balance : 0;
      }
      keys = result.UnprocessedKeys?.[table]?.Keys as Record<string, unknown>[] | undefined;
    }
  }
  return balances;
}
