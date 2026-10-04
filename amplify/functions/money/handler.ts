/**
 * Money function: every change to a balance goes through here (docs/SECURITY_PLAN.md).
 *
 * Internal operations, for our own Lambdas only (see shared/callerAuth.ts):
 * - ledgerApply: apply ledger entries with deterministic ids (deposits, refunds, squares)
 * - settleBet: pay out a bet whose dispute window has passed, computing every payout here
 *
 * Writes go to DynamoDB through the ledger (one atomic transaction per movement). Reads go
 * through AppSync. After a balance changes, the user's row is touched through AppSync so
 * the app's live subscription on User sees it; direct table writes do not fire
 * subscriptions.
 */

import type { Context } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/money';
import { type AmplifyResolverEvent, resolverFieldName } from '../../shared/amplifyResolverEvent';
import { accountIdFromArn, classifyCaller, type Caller } from '../../shared/callerAuth';
import type { LedgerEntry, StateUpdate, LedgerResult } from '../../shared/ledgerLogic';
import { hasOpenDispute, overturnedByDispute, planSettlement, type DisputeSummary } from '../../shared/settlementLogic';
import { notificationMeta } from '../../shared/notificationCatalog';
import { isProActive } from '../../../src/config/subscriptionConfig';
import { applyLedger } from './ledgerExecutor';
import { parseAwsJson, type SettleResult } from '../../shared/moneyClient';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Non-generic use, as in the other handlers, to avoid TS2590 on the generated model types.
const client = generateClient<Schema>() as any;

export const handler = async (event: AmplifyResolverEvent, context: Context): Promise<unknown> => {
  const fieldName = resolverFieldName(event);
  const caller = classifyCaller(event.identity, accountIdFromArn(context.invokedFunctionArn));

  switch (fieldName) {
    case 'ledgerApply':
      requireInternal(caller, fieldName);
      return ledgerApply(event.arguments as unknown as LedgerApplyArgs);
    case 'settleBet':
      requireInternal(caller, fieldName);
      return settleBet((event.arguments as { betId: string }).betId);
    default:
      throw new Error(`Unknown operation ${fieldName}`);
  }
};

function requireInternal(caller: Caller, operation: string): void {
  if (caller.kind !== 'internal') {
    console.warn(`[Money] Refused ${operation} for`, caller.kind === 'denied' ? caller.reason : caller.kind);
    throw new Error('Unauthorized');
  }
}

// --- ledgerApply --------------------------------------------------------------------

interface LedgerApplyArgs {
  entries: LedgerEntry[] | string;
  stateUpdates?: StateUpdate[] | string | null;
}

/** AppSync passes AWSJSON arguments as JSON text, possibly encoded twice. */
const parseJson = <T>(value: unknown, fallback: T): T => parseAwsJson<T>(value, fallback);

async function ledgerApply(args: LedgerApplyArgs): Promise<LedgerResult> {
  const entries = parseJson<LedgerEntry[]>(args.entries, []);
  const stateUpdates = parseJson<StateUpdate[]>(args.stateUpdates, []);
  const result = await applyLedger(entries, stateUpdates);
  if (result.status === 'applied') await touchUsers(result.balances.map((b) => b.userId));
  return result;
}

// --- settleBet ----------------------------------------------------------------------

/**
 * Pay out one bet. Safe to call repeatedly: every payout has a deterministic ledger id, and
 * the bet only becomes RESOLVED once, after every payout has gone through.
 */
async function settleBet(betId: string): Promise<SettleResult> {
  const { data: bet } = await client.models.Bet.get({ id: betId });
  if (!bet) return { status: 'skipped', reason: 'bet not found' };
  if (bet.status !== 'PENDING_RESOLUTION') return { status: 'skipped', reason: `status ${bet.status}` };
  if (!bet.winningSide) return { status: 'skipped', reason: 'no winning side' };

  // The dispute window and open disputes are checked here too, not only by the caller
  if (bet.disputeWindowEndsAt && new Date(bet.disputeWindowEndsAt).getTime() > Date.now()) {
    const participantsForWindow = await listParticipants(betId);
    const othersJoined = participantsForWindow.some((p) => p.userId !== bet.creatorId);
    if (othersJoined) return { status: 'skipped', reason: 'dispute window open' };
  }
  const disputes = await listDisputes(betId);
  if (hasOpenDispute(disputes)) return { status: 'skipped', reason: 'open dispute' };
  // An upheld dispute sends the bet back for re-resolution; the old result must not be paid
  if (overturnedByDispute(disputes, bet.disputeWindowEndsAt)) {
    return { status: 'skipped', reason: 'overturned by an upheld dispute; awaiting re-resolution' };
  }

  const participants = await listParticipants(betId);
  const proUserIds = new Set<string>();
  for (const userId of new Set(participants.map((p) => p.userId))) {
    const { data: user } = await client.models.User.get({ id: userId });
    if (isProActive(user)) proUserIds.add(userId);
  }

  const odds = parseJson<{ sideAName?: string; sideBName?: string }>(bet.odds, {});
  const plan = planSettlement({
    betId,
    betTitle: bet.title ?? 'Bet',
    winningSide: bet.winningSide,
    sideNames: { A: odds.sideAName, B: odds.sideBName },
    participants: participants.map((p) => ({ id: p.id, userId: p.userId, side: p.side, amount: p.amount ?? 0 })),
    proUserIds,
  });

  // One ledger transaction per movement: each is idempotent on its own id, so a failure
  // part-way leaves the bet PENDING_RESOLUTION and the next run finishes the rest
  for (const entry of plan.entries) {
    const result = await applyLedger([entry]);
    if (result.status === 'applied') {
      await touchUsers([entry.userId]);
      await notifyPayout(entry, bet.title ?? 'your bet', betId);
    } else if (result.status !== 'already_applied') {
      throw new Error(`Payout ${entry.transactionId} for bet ${betId}: ${JSON.stringify(result)}`);
    }
  }

  // Payout rows written at resolution by older app versions have random ids and
  // client-computed amounts. They are superseded by the server's own rows; cancel them so
  // they are never shown or paid.
  await supersedeStrayPayouts(betId, new Set(plan.entries.map((e) => e.transactionId)));

  const finished = await applyLedger([], [
    { table: 'Bet', id: betId, set: { status: 'RESOLVED' }, expect: { status: 'PENDING_RESOLUTION' } },
  ]);
  if (finished.status !== 'applied' && finished.status !== 'state_changed') {
    throw new Error(`Could not mark bet ${betId} resolved: ${JSON.stringify(finished)}`);
  }

  return {
    status: 'settled',
    paid: plan.refundedNoWinners ? 0 : plan.entries.length,
    refunded: plan.refundedNoWinners ? plan.entries.length : 0,
  };
}

interface ParticipantRow {
  id: string;
  userId: string;
  side: string;
  amount: number | null;
}

async function listParticipants(betId: string): Promise<ParticipantRow[]> {
  const rows: ParticipantRow[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Participant.participantsByBet({ betId }, { nextToken });
    rows.push(...((page.data ?? []) as ParticipantRow[]));
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

/**
 * Every dispute on a bet, through the disputesByBet index. The payout processor used a
 * filtered Scan, which reads one page of the table: an open dispute past that page did
 * not stop the payout.
 */
async function listDisputes(betId: string): Promise<DisputeSummary[]> {
  const rows: DisputeSummary[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Dispute.disputesByBet({ betId }, { nextToken });
    rows.push(...((page.data ?? []) as DisputeSummary[]));
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

async function supersedeStrayPayouts(betId: string, keep: Set<string>): Promise<void> {
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Transaction.transactionsByBet({ relatedBetId: betId }, { nextToken });
    for (const row of page.data ?? []) {
      if (row.type === 'BET_WON' && row.status === 'PENDING' && !keep.has(row.id)) {
        await client.models.Transaction.update({
          id: row.id,
          status: 'CANCELLED',
          failureReason: 'Superseded by the server-computed payout',
        });
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);
}

// --- helpers ------------------------------------------------------------------------

/**
 * Touch each user's row through AppSync so subscribers to User.onUpdate (the app's live
 * balance) receive the new balance. The ledger already wrote it; this only notifies.
 */
async function touchUsers(userIds: string[]): Promise<void> {
  for (const id of new Set(userIds)) {
    try {
      await client.models.User.update({ id });
    } catch (error) {
      // The money moved; a missed live update is fixed by the next read
      console.warn(`[Money] Could not notify subscribers for user ${id}:`, error);
    }
  }
}

async function notifyPayout(entry: LedgerEntry, betTitle: string, betId: string): Promise<void> {
  const won = entry.type === 'BET_WON';
  const fee = entry.platformFee ?? 0;
  const net = entry.delta;
  try {
    await client.models.Notification.create({
      userId: entry.userId,
      type: won ? 'BET_RESOLVED' : 'BET_CANCELLED',
      ...notificationMeta(won ? 'BET_RESOLVED' : 'BET_CANCELLED'),
      title: won ? 'Bet Won!' : 'Stake Returned',
      message: won
        ? fee > 0
          ? `You won $${net.toFixed(2)} on "${betTitle}" (platform fee: $${fee.toFixed(2)})`
          : `You won $${net.toFixed(2)} on "${betTitle}"`
        : `Your $${net.toFixed(2)} stake on "${betTitle}" was returned: nobody backed the winning side.`,
      isRead: false,
      priority: 'HIGH',
      actionType: 'view_bet',
      actionData: { betId },
      relatedBetId: betId,
    });
  } catch (error) {
    console.warn(`[Money] Payout notification failed for ${entry.userId}:`, error);
  }
}

