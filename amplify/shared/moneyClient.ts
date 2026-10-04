/**
 * How our Lambdas call the money function (functions/money) through AppSync.
 *
 * Every balance change goes through it; see docs/SECURITY_PLAN.md. The calls use the
 * calling Lambda's IAM access to the API, which the money function accepts as internal
 * (shared/callerAuth.ts).
 */

import type { LedgerEntry, LedgerResult, StateUpdate } from './ledgerLogic';

/**
 * AWSJSON can arrive as an object or as JSON text, sometimes encoded twice depending on
 * how the caller passed it; unwrap until it is not a string.
 */
export function parseAwsJson<T>(value: unknown, fallback: T): T {
  let current = value;
  for (let i = 0; i < 3 && typeof current === 'string'; i++) {
    current = JSON.parse(current);
  }
  return current === null || current === undefined ? fallback : (current as T);
}

// The generated client is used untyped in the Lambdas (TS2590 on the model types)
type DataClient = { mutations: Record<string, (args: Record<string, unknown>) => Promise<{ data?: unknown; errors?: unknown[] }>> };

export async function ledgerApply(
  client: DataClient,
  entries: LedgerEntry[],
  stateUpdates: StateUpdate[] = []
): Promise<LedgerResult> {
  const { data, errors } = await client.mutations.ledgerApply({
    entries: JSON.stringify(entries),
    ...(stateUpdates.length ? { stateUpdates: JSON.stringify(stateUpdates) } : {}),
  });
  if (errors?.length) throw new Error(`ledgerApply failed: ${JSON.stringify(errors)}`);
  return parseAwsJson<LedgerResult>(data, { status: 'rejected', reason: 'empty response' });
}

export type SettleResult =
  | { status: 'settled'; paid: number; refunded: number }
  | { status: 'skipped'; reason: string };

export async function settleBet(client: DataClient, betId: string): Promise<SettleResult> {
  const { data, errors } = await client.mutations.settleBet({ betId });
  if (errors?.length) throw new Error(`settleBet failed: ${JSON.stringify(errors)}`);
  return parseAwsJson<SettleResult>(data, { status: 'skipped', reason: 'empty response' });
}
