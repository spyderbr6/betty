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
import { accountIdFromArn, classifyCaller, isAdmin, type Caller } from '../../shared/callerAuth';
import type { LedgerEntry, StateUpdate, LedgerResult } from '../../shared/ledgerLogic';
import { hasOpenDispute, overturnedByDispute, payoutTransactionId, planSettlement, type DisputeSummary } from '../../shared/settlementLogic';
import { notificationMeta } from '../../shared/notificationCatalog';
import { isProActive } from '../../../src/config/subscriptionConfig';
import { applyLedger } from './ledgerExecutor';
import { parseAwsJson, type SettleResult } from '../../shared/moneyClient';
import { checkJoin, planJoin, type JoinResult } from '../../shared/joinLogic';
import { invalidField, planCreateBet, type CreateBetArgs, type CreateBetResult } from '../../shared/createBetLogic';
import { checkResolve, planResolve, type ExistingLedgerRow, type ResolvePlan, type ResolveResult } from '../../shared/resolveLogic';
import { checkAccept, planAccept, type AcceptParticipant, type AcceptResult } from '../../shared/acceptLogic';
import { checkBuy, ownsAllRequested, planBuy, planLock, purchaseTransactionId, type BuyResult, type Square } from '../../shared/squaresBuyLogic';
import { cancelSquaresGame, checkSquaresCancel, type SquaresCancelRefusal } from '../../shared/squaresMoney';
import { checkWithdraw, planDecide, planWithdraw, type DecideRefusal, type WithdrawResult } from '../../shared/withdrawLogic';
import { DEFAULT_TRUST_SCORE, MAX_TRUST_SCORE, MIN_TRUST_SCORE, TRUST_CHANGES } from '../../../src/config/trustScoreConfig';
import { checkResolveDispute, planUphold, type DisputeOutcome, type ResolveDisputeResult } from '../../shared/disputeLogic';
import { randomInt } from 'node:crypto';

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
    case 'joinBet':
      return joinBet(requireUser(caller, fieldName), event.arguments as unknown as JoinBetArgs);
    case 'createBetWithStake':
      return createBetWithStake(requireUser(caller, fieldName), event.arguments as unknown as CreateBetArgs);
    case 'resolveBet': {
      const { betId, winningSide } = event.arguments as { betId: string; winningSide: string };
      return resolveBet(requireUser(caller, fieldName), betId, winningSide);
    }
    case 'acceptBetResult':
      return acceptBetResult(requireUser(caller, fieldName), (event.arguments as { betId: string }).betId);
    case 'requestWithdrawal':
      return requestWithdrawal(requireUser(caller, fieldName), event.arguments as unknown as RequestWithdrawalArgs);
    case 'adminDecideTransaction': {
      requireUser(caller, fieldName);
      return adminDecideTransaction(caller as Extract<Caller, { kind: 'user' }>, event.arguments as unknown as DecideArgs);
    }
    case 'adminResolveDispute': {
      requireUser(caller, fieldName);
      return adminResolveDispute(caller as Extract<Caller, { kind: 'user' }>, event.arguments as unknown as ResolveDisputeArgs);
    }
    case 'buySquares':
      return buySquares(requireUser(caller, fieldName), event.arguments as unknown as BuySquaresArgs);
    case 'cancelSquaresGame': {
      requireUser(caller, fieldName);
      const { squaresGameId, reason } = event.arguments as { squaresGameId: string; reason?: string | null };
      return cancelSquaresGameFor(caller as Extract<Caller, { kind: 'user' }>, squaresGameId, reason);
    }
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

/** A signed-in app user; returns their id (the Cognito sub). Everything else is refused. */
function requireUser(caller: Caller, operation: string): string {
  if (caller.kind !== 'user') {
    console.warn(`[Money] Refused ${operation} for`, caller.kind === 'denied' ? caller.reason : caller.kind);
    throw new Error('Unauthorized');
  }
  return caller.sub;
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
  if (overturnedByDispute(disputes, bet)) {
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
  if (finished.status === 'state_changed') {
    // A concurrent run marked it first. Only that run reports settled, so the caller's
    // one-off work (the creator's trust reward) happens once.
    return { status: 'skipped', reason: 'already resolved by another run' };
  }
  if (finished.status !== 'applied') {
    throw new Error(`Could not mark bet ${betId} resolved: ${JSON.stringify(finished)}`);
  }
  await touchBet(betId);

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

// --- joinBet (app users) --------------------------------------------------------------

interface JoinBetArgs {
  betId: string;
  side: string;
  amount: number;
}

/**
 * Join a bet as the caller: checks on the server (joinLogic.checkJoin), then the
 * participant row, the stake and the bet's counts in one ledger transaction.
 */
async function joinBet(userId: string, args: JoinBetArgs): Promise<JoinResult> {
  const { betId, side, amount } = args;
  const now = new Date().toISOString();

  const { data: bet } = await client.models.Bet.get({ id: betId });
  const participants = bet ? await listParticipants(betId) : [];
  const refusal = checkJoin({
    bet,
    userId,
    side,
    amount,
    now,
    alreadyJoined: participants.some((p) => p.userId === userId),
    invited: bet?.isPrivate ? await isInvited(userId, betId) : false,
  });
  if (refusal) return { status: 'refused', reason: refusal };

  const odds = parseJson<{ sideAName?: string; sideBName?: string }>(bet.odds, {});
  const sideName = (side === 'A' ? odds.sideAName : odds.sideBName) || `Side ${side}`;
  const plan = planJoin({ bet, userId, side: side as 'A' | 'B', sideName, now });

  const result = await applyLedger(plan.entries, plan.stateUpdates);
  switch (result.status) {
    case 'applied':
      break;
    case 'insufficient_funds':
      return { status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: result.balance, required: result.required };
    case 'already_applied':
      // The stake row exists: this user's join went through before
      return { status: 'refused', reason: 'ALREADY_JOINED' };
    case 'state_changed': {
      // The bet closed, passed its deadline or was joined by this user in the meantime;
      // say which, from a fresh read
      const { data: fresh } = await client.models.Bet.get({ id: betId });
      const again = checkJoin({
        bet: fresh,
        userId,
        side,
        amount,
        now: new Date().toISOString(),
        alreadyJoined: (await listParticipants(betId)).some((p) => p.userId === userId),
        invited: true,
      });
      return { status: 'refused', reason: again ?? 'BUSY' };
    }
    default:
      throw new Error(`Join ${plan.participantId}: ${JSON.stringify(result)}`);
  }

  await touchUsers([userId]);
  await touchBet(betId);
  if (bet.creatorId && bet.creatorId !== userId) {
    await notifyJoined(bet.creatorId, userId, bet.title ?? 'your bet', betId, bet.betAmount);
  }
  const balance = result.balances.find((b) => b.userId === userId)?.after ?? 0;
  return { status: 'joined', participantId: plan.participantId, amount: bet.betAmount, balance };
}

/** Whether the user holds a pending or accepted invitation to the bet. */
async function isInvited(userId: string, betId: string): Promise<boolean> {
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.BetInvitation.betInvitationsByToUser(
      { toUserId: userId },
      { filter: { betId: { eq: betId } }, nextToken }
    );
    if ((page.data ?? []).some((i: { status?: string }) => i.status === 'PENDING' || i.status === 'ACCEPTED')) return true;
    nextToken = page.nextToken;
  } while (nextToken);
  return false;
}

async function notifyJoined(creatorId: string, joinerId: string, betTitle: string, betId: string, amount: number): Promise<void> {
  try {
    const { data: joiner } = await client.models.User.get({ id: joinerId });
    await client.models.Notification.create({
      userId: creatorId,
      type: 'BET_JOINED',
      ...notificationMeta('BET_JOINED'),
      title: 'Someone Joined Your Bet!',
      message: `${joiner?.displayName || joiner?.username || 'Someone'} joined "${betTitle}" with $${amount}`,
      isRead: false,
      priority: 'HIGH',
      actionType: 'view_bet',
      actionData: { betId },
      relatedBetId: betId,
      relatedUserId: joinerId,
    });
  } catch (error) {
    console.warn(`[Money] Join notification failed for ${creatorId}:`, error);
  }
}

// --- createBetWithStake (app users) ---------------------------------------------------

/**
 * Create a bet with the caller as its first participant: the bet, their participant row
 * and their stake in one ledger transaction (createBetLogic). The app chooses the bet id,
 * so a retried tap finds its own earlier write rather than making a second bet.
 */
async function createBetWithStake(userId: string, args: CreateBetArgs): Promise<CreateBetResult> {
  const field = invalidField(args);
  if (field) return { status: 'refused', reason: 'INVALID', field };

  const { data: creator } = await client.models.User.get({ id: userId });
  const creatorName = creator?.displayName || creator?.username || 'User';
  const plan = planCreateBet({ args, userId, creatorName, now: new Date().toISOString() });

  const result = await applyLedger(plan.entries, plan.stateUpdates);
  switch (result.status) {
    case 'applied':
      await touchUsers([userId]);
      // The bet was written directly, which fires no onCreate; the touch's onUpdate is what
      // puts it in open apps' feeds (BetDataContext adds a bet it has not seen)
      await touchBet(args.betId);
      return { status: 'created', betId: args.betId, balance: result.balances.find((b) => b.userId === userId)?.after ?? 0 };
    case 'already_applied': {
      // This user's stake on this bet exists. It is a retry of their own create only if
      // they created the bet: someone who joined it has a stake row there too.
      const { data: existing } = await client.models.Bet.get({ id: args.betId });
      if (existing?.creatorId !== userId) return { status: 'refused', reason: 'INVALID', field: 'betId' };
      const { data: me } = await client.models.User.get({ id: userId });
      return { status: 'created', betId: args.betId, balance: me?.balance ?? 0 };
    }
    case 'insufficient_funds':
      return { status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: result.balance, required: result.required };
    case 'state_changed':
      // The id is another bet's: refuse rather than touch it
      return { status: 'refused', reason: 'INVALID', field: 'betId' };
    default:
      throw new Error(`Create bet ${args.betId}: ${JSON.stringify(result)}`);
  }
}

// --- resolveBet (the bet's creator) ---------------------------------------------------

/** Writes per transaction, under DynamoDB's 100 with room for the ledger's own items. */
const RESOLVE_BATCH = 90;

/**
 * The creator picks the winner: checked on the server, payouts computed from the stakes,
 * and the bet, each participant's outcome and the pending winnings written in one ledger
 * transaction guarded on the bet being unchanged since it was read (resolveLogic). No
 * money moves; the payout processor pays after the dispute window.
 */
async function resolveBet(userId: string, betId: string, winningSide: string): Promise<ResolveResult> {
  const { data: bet } = await client.models.Bet.get({ id: betId });
  const refusal = checkResolve(bet, userId, winningSide);
  if (refusal) return { status: 'refused', reason: refusal };

  const participants = await listParticipants(betId);
  const proUserIds = new Set<string>();
  for (const id of new Set(participants.map((p) => p.userId))) {
    const { data: participantUser } = await client.models.User.get({ id });
    if (isProActive(participantUser)) proUserIds.add(id);
  }
  const odds = parseJson<{ sideAName?: string; sideBName?: string }>(bet.odds, {});
  const plan = planResolve({
    bet,
    winningSide: winningSide as 'A' | 'B',
    sideNames: { A: odds.sideAName, B: odds.sideBName },
    participants: participants.map((p) => ({ id: p.id, userId: p.userId, side: p.side, amount: p.amount ?? 0 })),
    proUserIds,
    existing: await listBetTransactions(betId),
    now: new Date().toISOString(),
  });

  let result: LedgerResult;
  if (plan.entries.length + plan.stateUpdates.length <= RESOLVE_BATCH) {
    result = await applyLedger(plan.entries, plan.stateUpdates);
  } else {
    // Too many participants for one transaction. The resolution itself (the bet) commits
    // first, alone and guarded; the records follow in batches. They are idempotent, and
    // only for display: settlement recomputes every payout from the stakes.
    result = await applyLedger([], plan.stateUpdates.slice(0, 1));
    if (result.status === 'applied') {
      const rest = [
        ...plan.entries.map((entry) => ({ entry })),
        ...plan.stateUpdates.slice(1).map((update) => ({ update })),
      ];
      for (let i = 0; i < rest.length; i += RESOLVE_BATCH) {
        const batch = rest.slice(i, i + RESOLVE_BATCH);
        const done = await applyLedger(
          batch.flatMap((b) => ('entry' in b ? [b.entry] : [])),
          batch.flatMap((b) => ('update' in b ? [b.update] : []))
        );
        if (done.status !== 'applied' && done.status !== 'already_applied' && done.status !== 'state_changed') {
          console.error(`[Money] Resolution records for bet ${betId} incomplete: ${JSON.stringify(done)}`);
        }
      }
    }
  }

  if (result.status === 'state_changed' || result.status === 'already_applied') {
    // Someone joined, or it was resolved, since it was read: say which from a fresh read
    const { data: fresh } = await client.models.Bet.get({ id: betId });
    return { status: 'refused', reason: checkResolve(fresh, userId, winningSide) ?? 'BUSY' };
  }
  if (result.status !== 'applied') {
    throw new Error(`Resolve bet ${betId}: ${JSON.stringify(result)}`);
  }

  await touchBet(betId);
  await notifyResolved(plan, bet, winningSide as 'A' | 'B', odds, userId);
  return {
    status: 'resolved',
    winningSide: winningSide as 'A' | 'B',
    disputeWindowEndsAt: plan.disputeWindowEndsAt,
    winners: plan.winners,
    refundedNoWinners: plan.refundedNoWinners,
  };
}

/** Every ledger row recorded against a bet (id, type, status), through transactionsByBet. */
async function listBetTransactions(betId: string): Promise<ExistingLedgerRow[]> {
  const rows: ExistingLedgerRow[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Transaction.transactionsByBet({ relatedBetId: betId }, { nextToken });
    rows.push(...((page.data ?? []) as ExistingLedgerRow[]).map((r) => ({ id: r.id, type: r.type, status: r.status })));
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

/** Tell each participant but the creator how it went, with the server's figures. */
async function notifyResolved(
  plan: ResolvePlan,
  bet: { id: string; title?: string | null },
  winningSide: 'A' | 'B',
  odds: { sideAName?: string; sideBName?: string },
  creatorId: string
): Promise<void> {
  const winnerName = (winningSide === 'A' ? odds.sideAName : odds.sideBName) || `Side ${winningSide}`;
  const title = bet.title ?? 'the bet';
  for (const outcome of plan.outcomes) {
    if (outcome.userId === creatorId) continue;
    try {
      await client.models.Notification.create({
        userId: outcome.userId,
        type: 'BET_RESOLVED',
        ...notificationMeta('BET_RESOLVED'),
        title: outcome.won ? 'Bet Won! (Pending)' : plan.refundedNoWinners ? 'Bet Resolved' : 'Bet Lost',
        message: outcome.won
          ? `You won $${outcome.net.toFixed(2)} on "${title}". Funds will be available in 48 hours if no disputes are filed.`
          : plan.refundedNoWinners
            ? `Nobody backed ${winnerName} on "${title}", so every stake will be returned after the 48-hour dispute window.`
            : `You lost on "${title}". The winner was ${winnerName}.`,
        isRead: false,
        priority: outcome.won ? 'HIGH' : 'MEDIUM',
        actionType: 'view_bet',
        actionData: { betId: bet.id },
        relatedBetId: bet.id,
      });
    } catch (error) {
      console.warn(`[Money] Resolution notification failed for ${outcome.userId}:`, error);
    }
  }
}

// --- acceptBetResult (a participant) --------------------------------------------------

/**
 * A participant accepts the result; when everyone but the creator has, the dispute window
 * closes early (acceptLogic). Both in one transaction guarded on the result being unchanged.
 */
async function acceptBetResult(userId: string, betId: string): Promise<AcceptResult> {
  const { data: bet } = await client.models.Bet.get({ id: betId });
  const participants = bet ? await listAcceptParticipants(betId) : [];
  const refusal = checkAccept(bet, userId, participants);
  if (refusal) return { status: 'refused', reason: refusal };

  const plan = planAccept({ bet, userId, participants, now: new Date().toISOString() });
  if (plan.stateUpdates.length) {
    const result = await applyLedger([], plan.stateUpdates);
    if (result.status === 'state_changed') return { status: 'refused', reason: 'NOT_AWAITING' };
    if (result.status !== 'applied') throw new Error(`Accept ${betId}: ${JSON.stringify(result)}`);
  }

  if (plan.closesEarly) {
    await touchBet(betId);
    await notifyClosingEarly(bet, participants);
  } else if (plan.stateUpdates.length && bet.creatorId) {
    try {
      await client.models.Notification.create({
        userId: bet.creatorId,
        type: 'BET_RESOLVED',
        ...notificationMeta('BET_RESOLVED'),
        title: 'Bet Result Accepted',
        message: `${plan.accepted} of ${plan.total} participants have accepted the result for "${bet.title}"`,
        isRead: false,
        priority: 'MEDIUM',
        actionType: 'view_bet',
        actionData: { betId },
        relatedBetId: betId,
        relatedUserId: userId,
      });
    } catch (error) {
      console.warn(`[Money] Acceptance notification failed for ${bet.creatorId}:`, error);
    }
  }
  return { status: 'accepted', closedEarly: plan.closesEarly, accepted: plan.accepted, total: plan.total };
}

async function listAcceptParticipants(betId: string): Promise<Array<AcceptParticipant & { side: string }>> {
  const rows: Array<AcceptParticipant & { side: string }> = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Participant.participantsByBet({ betId }, { nextToken });
    for (const p of page.data ?? []) rows.push({ id: p.id, userId: p.userId, side: p.side, hasAcceptedResult: p.hasAcceptedResult });
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

/** Everyone accepted: tell each participant, winners with what they will receive. */
async function notifyClosingEarly(
  bet: { id: string; title?: string | null; winningSide?: string | null },
  participants: Array<AcceptParticipant & { side: string }>
): Promise<void> {
  for (const participant of participants) {
    const won = participant.side === bet.winningSide;
    let net = 0;
    if (won) {
      const { data: pending } = await client.models.Transaction.get({ id: payoutTransactionId(participant.id) });
      net = pending?.actualAmount ?? pending?.amount ?? 0;
    }
    try {
      await client.models.Notification.create({
        userId: participant.userId,
        type: 'BET_RESOLVED',
        ...notificationMeta('BET_RESOLVED'),
        title: 'Bet Closing Early!',
        message: won
          ? net > 0
            ? `All participants accepted the result! You'll receive $${net.toFixed(2)} within 5 minutes.`
            : `All participants accepted the result! Your winnings will arrive within 5 minutes.`
          : `All participants accepted the result of "${bet.title}". Better luck next time!`,
        isRead: false,
        priority: 'HIGH',
        actionType: 'view_bet',
        actionData: { betId: bet.id },
        relatedBetId: bet.id,
      });
    } catch (error) {
      console.warn(`[Money] Early-close notification failed for ${participant.userId}:`, error);
    }
  }
}

// --- requestWithdrawal (app users) and adminDecideTransaction (admins) ----------------

interface RequestWithdrawalArgs {
  requestId: string;
  amount: number;
  paymentMethodId: string;
}

/**
 * Request a withdrawal: the amount leaves the balance now, as a PENDING withdrawal an
 * admin then completes or rejects (withdrawLogic). The request id is the app's, so a
 * repeated request reaches the same withdrawal.
 */
async function requestWithdrawal(userId: string, args: RequestWithdrawalArgs): Promise<WithdrawResult> {
  const { data: method } = await client.models.PaymentMethod.get({ id: args.paymentMethodId });
  const refusal = checkWithdraw({ requestId: args.requestId, amount: args.amount, method, userId });
  if (refusal) return { status: 'refused', ...refusal };

  const { data: me } = await client.models.User.get({ id: userId });
  const plan = planWithdraw({ requestId: args.requestId, userId, amount: args.amount, isPro: isProActive(me), method });
  const result = await applyLedger([plan.entry]);
  switch (result.status) {
    case 'applied':
      await touchUsers([userId]);
      return {
        status: 'requested',
        transactionId: plan.entry.transactionId,
        amount: plan.entry.amount,
        fee: plan.fee,
        net: plan.net,
        balance: result.balances.find((b) => b.userId === userId)?.after ?? 0,
      };
    case 'already_applied': {
      // A repeat of this request: report the withdrawal it made
      const { data: earlier } = await client.models.Transaction.get({ id: plan.entry.transactionId });
      if (earlier?.userId !== userId) return { status: 'refused', reason: 'INVALID_REQUEST' };
      const { data: now } = await client.models.User.get({ id: userId });
      return {
        status: 'requested',
        transactionId: earlier.id,
        amount: earlier.amount ?? plan.entry.amount,
        fee: earlier.platformFee ?? plan.fee,
        net: earlier.actualAmount ?? plan.net,
        balance: now?.balance ?? 0,
      };
    }
    case 'insufficient_funds':
      return { status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: result.balance, required: result.required };
    default:
      throw new Error(`Withdrawal ${plan.entry.transactionId}: ${JSON.stringify(result)}`);
  }
}

interface DecideArgs {
  transactionId: string;
  approve: boolean;
  reason?: string | null;
  actualAmount?: number | null;
}

type DecideResult =
  | { status: 'decided'; outcome: 'COMPLETED' | 'FAILED'; userId: string; credited: number }
  | { status: 'refused'; reason: DecideRefusal | 'NOT_ADMIN' };

/**
 * An admin approves or rejects a pending deposit or withdrawal (withdrawLogic.planDecide).
 * Admin is the Cognito admins group, checked here; the app used to check a role field
 * users could write on their own record. The money and the status change are one ledger
 * transaction, completed only while the row is still PENDING, so a double tap or a
 * decision racing the Stripe webhook cannot move money twice.
 */
async function adminDecideTransaction(caller: Extract<Caller, { kind: 'user' }>, args: DecideArgs): Promise<DecideResult> {
  if (!isAdmin(caller)) {
    console.warn('[Money] adminDecideTransaction refused for non-admin', caller.sub);
    return { status: 'refused', reason: 'NOT_ADMIN' };
  }
  const { data: tx } = await client.models.Transaction.get({ id: args.transactionId });
  const plan = planDecide({ tx, approve: args.approve, adminId: caller.sub, reason: args.reason, actualAmount: args.actualAmount });
  if ('refused' in plan) return { status: 'refused', reason: plan.refused };

  const result = await applyLedger([plan.entry]);
  if (result.status === 'already_applied') return { status: 'refused', reason: 'NOT_PENDING' };
  if (result.status === 'insufficient_funds') return { status: 'refused', reason: 'INSUFFICIENT_FUNDS' };
  if (result.status !== 'applied') throw new Error(`Decide ${args.transactionId}: ${JSON.stringify(result)}`);

  const userId = plan.entry.userId;
  const amount = plan.entry.amount;
  const outcome = plan.entry.status as 'COMPLETED' | 'FAILED';
  await touchUsers([userId]);

  // What the app's admin path told the user and did to their trust score, unchanged
  if (tx.type === 'DEPOSIT') {
    if (outcome === 'COMPLETED') {
      const fee = amount - plan.entry.delta;
      await notifyUser(userId, 'DEPOSIT_COMPLETED', 'Deposit Successful',
        fee > 0.01
          ? `Your deposit of $${plan.entry.delta.toFixed(2)} has been completed (fee: $${fee.toFixed(2)})`
          : `Your deposit of $${plan.entry.delta.toFixed(2)} has been completed`);
      await adjustTrust(userId, TRUST_CHANGES.SUCCESSFUL_DEPOSIT, `Successfully deposited $${amount.toFixed(2)}`, tx.id);
    } else {
      await notifyUser(userId, 'DEPOSIT_FAILED', 'Deposit Failed', plan.entry.failureReason ?? 'Transaction could not be completed');
      await adjustTrust(userId, TRUST_CHANGES.FAILED_TRANSACTION, 'Failed deposit - fraud attempt detected', tx.id);
    }
  } else if (outcome === 'COMPLETED') {
    await notifyUser(userId, 'WITHDRAWAL_COMPLETED', 'Withdrawal Complete', `Your withdrawal of $${amount.toFixed(2)} has been sent`);
    await adjustTrust(userId, TRUST_CHANGES.SUCCESSFUL_WITHDRAWAL, `Successfully withdrew $${amount.toFixed(2)}`, tx.id);
  } else {
    const returned = plan.entry.delta > 0 ? ` The $${plan.entry.delta.toFixed(2)} has been returned to your balance.` : '';
    await notifyUser(userId, 'WITHDRAWAL_FAILED', 'Withdrawal Failed', `${plan.entry.failureReason ?? 'Transaction could not be completed'}.${returned}`);
    await adjustTrust(userId, TRUST_CHANGES.FAILED_TRANSACTION, 'Failed withdrawal - fraud attempt detected', tx.id);
  }

  return { status: 'decided', outcome, userId, credited: plan.entry.delta };
}

// --- adminResolveDispute (admins) --------------------------------------------------------

interface ResolveDisputeArgs {
  disputeId: string;
  outcome: string;
  resolution?: string | null;
  adminNotes?: string | null;
}

/**
 * An admin decides a dispute (disputeLogic). Upheld: the winner is cleared and the bet's
 * pending payouts cancelled in one ledger transaction, and the creator resolves again.
 * Dismissed or found for the creator: the payout goes ahead. The dispute record, trust
 * changes and notifications follow, as the app's admin path did them.
 */
async function adminResolveDispute(caller: Extract<Caller, { kind: 'user' }>, args: ResolveDisputeArgs): Promise<ResolveDisputeResult> {
  if (!isAdmin(caller)) {
    console.warn('[Money] adminResolveDispute refused for non-admin', caller.sub);
    return { status: 'refused', reason: 'NOT_ADMIN' };
  }
  const { data: dispute } = await client.models.Dispute.get({ id: args.disputeId });
  const { data: bet } = dispute?.betId ? await client.models.Bet.get({ id: dispute.betId }) : { data: null };
  const refusal = checkResolveDispute({ dispute, bet, outcome: args.outcome });
  if (refusal) return { status: 'refused', reason: refusal };
  const outcome = args.outcome as DisputeOutcome;
  const upheld = outcome === 'RESOLVED_FOR_FILER';

  let payoutsCancelled = 0;
  if (upheld) {
    const updates = planUphold({ bet, existing: await listBetTransactions(bet.id) });
    const result = await applyLedger([], updates);
    if (result.status === 'state_changed' || result.status === 'already_applied') return { status: 'refused', reason: 'BUSY' };
    if (result.status !== 'applied') throw new Error(`Uphold dispute ${dispute.id}: ${JSON.stringify(result)}`);
    payoutsCancelled = updates.length - 1;
    await touchBet(bet.id);
  }

  // The dispute's own record (not money): after the money, so a failure here leaves the
  // dispute open, which keeps the payout processor from paying
  await client.models.Dispute.update({
    id: dispute.id,
    status: outcome,
    resolution: (args.resolution ?? '').trim().slice(0, 2000) || null,
    resolvedBy: caller.sub,
    adminNotes: (args.adminNotes ?? '').trim().slice(0, 2000) || null,
    resolvedAt: new Date().toISOString(),
  });

  const creator = dispute.againstUserId;
  const filer = dispute.filedBy;
  const action = { actionType: 'view_bet', actionData: { betId: dispute.betId }, relatedBetId: dispute.betId };
  if (upheld) {
    if (creator) await adjustTrustFor(creator, TRUST_CHANGES.LOST_DISPUTE_CREATOR, 'Lost dispute - bet resolved unfairly', dispute);
    if (filer) await adjustTrustFor(filer, TRUST_CHANGES.WON_DISPUTE_PARTICIPANT, 'Dispute upheld - you were right to challenge the resolution', dispute);
    if (filer) await notifyAbout(filer, 'Dispute Resolved', 'Your dispute was upheld. The bet resolution will be corrected.', 'HIGH', action);
    if (creator) await notifyAbout(creator, 'Dispute Resolved Against You', 'A dispute on your bet was upheld. Please resolve the bet correctly.', 'URGENT', action);
  } else {
    if (creator) await adjustTrustFor(creator, TRUST_CHANGES.DISPUTE_DISMISSED, 'Dispute dismissed - your resolution was fair', dispute);
    if (filer) await adjustTrustFor(filer, TRUST_CHANGES.LOST_DISPUTE_PARTICIPANT, 'Filed false dispute - resolution was fair', dispute);
    if (filer) await notifyAbout(filer, 'Dispute Dismissed', 'Your dispute was reviewed and dismissed. The original resolution stands.', 'MEDIUM', action);
    if (creator) await notifyAbout(creator, 'Dispute Dismissed', 'The dispute on your bet was dismissed. Your resolution was correct.', 'MEDIUM', action);
  }
  return { status: 'resolved', outcome, payoutsCancelled };
}

async function adjustTrustFor(userId: string, change: number, reason: string, dispute: { id: string; betId?: string | null }): Promise<void> {
  try {
    const { data: user } = await client.models.User.get({ id: userId });
    const current = typeof user?.trustScore === 'number' ? user.trustScore : DEFAULT_TRUST_SCORE;
    const newScore = Math.max(MIN_TRUST_SCORE, Math.min(MAX_TRUST_SCORE, current + change));
    await client.models.User.update({ id: userId, trustScore: newScore });
    await client.models.TrustScoreHistory.create({
      userId, change, newScore, reason, relatedBetId: dispute.betId, relatedDisputeId: dispute.id, createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(`[Money] Trust score change failed for ${userId}:`, error);
  }
}

async function notifyAbout(
  userId: string,
  title: string,
  message: string,
  priority: 'MEDIUM' | 'HIGH' | 'URGENT',
  action: { actionType: string; actionData: Record<string, unknown>; relatedBetId?: string | null }
): Promise<void> {
  try {
    await client.models.Notification.create({
      userId, type: 'BET_DISPUTED', ...notificationMeta('BET_DISPUTED'), title, message, isRead: false, priority, ...action,
    });
  } catch (error) {
    console.warn(`[Money] Dispute notification failed for ${userId}:`, error);
  }
}

/** A trust score change and its history row (the amounts are src/config/trustScoreConfig). */
async function adjustTrust(userId: string, change: number, reason: string, relatedTransactionId: string): Promise<void> {
  try {
    const { data: user } = await client.models.User.get({ id: userId });
    const current = typeof user?.trustScore === 'number' ? user.trustScore : DEFAULT_TRUST_SCORE;
    const newScore = Math.max(MIN_TRUST_SCORE, Math.min(MAX_TRUST_SCORE, current + change));
    await client.models.User.update({ id: userId, trustScore: newScore });
    await client.models.TrustScoreHistory.create({
      userId, change, newScore, reason, relatedTransactionId, createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn(`[Money] Trust score change failed for ${userId}:`, error);
  }
}

async function notifyUser(userId: string, type: Parameters<typeof notificationMeta>[0], title: string, message: string): Promise<void> {
  try {
    await client.models.Notification.create({ userId, type, ...notificationMeta(type), title, message, isRead: false, priority: 'HIGH' });
  } catch (error) {
    console.warn(`[Money] ${type} notification failed for ${userId}:`, error);
  }
}

// --- buySquares and cancelSquaresGame (app users) ------------------------------------

interface BuySquaresArgs {
  squaresGameId: string;
  ownerName: string;
  squares: unknown;
}

const GRID_SIZE = 100;

/**
 * Buy squares as the caller: checked on the server, and one purchase row per square (a
 * fixed id each, so a square sells once), the debit and the game's counts in one ledger
 * transaction (squaresBuyLogic). A purchase that fills the grid locks it here, with
 * numbers drawn on the server.
 */
async function buySquares(userId: string, args: BuySquaresArgs): Promise<BuyResult> {
  const { squaresGameId, ownerName } = args;
  const squares = parseJson<unknown>(args.squares, null);
  const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
  const sold = async () =>
    (await listSquaresPurchases(squaresGameId)).map((p) => ({ row: p.gridRow, col: p.gridCol, userId: p.userId }));

  const purchases = game ? await sold() : [];
  // A repeat of this user's own purchase (its answer lost, say) is answered as bought, not
  // as taken, once its ledger row confirms it is that exact purchase. Nothing is charged.
  if (ownsAllRequested(squares, purchases, userId)) {
    const { data: earlier } = await client.models.Transaction.get({
      id: purchaseTransactionId(squaresGameId, userId, squares as Square[]),
    });
    if (earlier) {
      const { data: me } = await client.models.User.get({ id: userId });
      const count = (squares as Square[]).length;
      return { status: 'bought', squares: count, total: earlier.amount ?? 0, balance: me?.balance ?? 0, locked: Boolean(game.numbersAssigned) };
    }
  }

  const refusal = checkBuy({ game, squares, ownerName, taken: purchases });
  if (refusal) return { status: 'refused', ...refusal };

  const plan = planBuy({ game, userId, ownerName, squares: squares as Square[], now: new Date().toISOString() });
  const result = await applyLedger(plan.entries, plan.stateUpdates);
  let balance: number;
  switch (result.status) {
    case 'applied':
      balance = result.balances.find((b) => b.userId === userId)?.after ?? 0;
      break;
    case 'already_applied': {
      // This user bought exactly these squares before: a retry
      const { data: me } = await client.models.User.get({ id: userId });
      balance = me?.balance ?? 0;
      break;
    }
    case 'insufficient_funds':
      return { status: 'refused', reason: 'INSUFFICIENT_FUNDS', balance: result.balance, required: result.required };
    case 'state_changed': {
      // A square sold or the game locked in the meantime: say which from a fresh read
      const { data: fresh } = await client.models.SquaresGame.get({ id: squaresGameId });
      const again = checkBuy({ game: fresh, squares, ownerName, taken: fresh ? await sold() : [] });
      return again ? { status: 'refused', ...again } : { status: 'refused', reason: 'BUSY' };
    }
    default:
      throw new Error(`Buy squares in ${squaresGameId}: ${JSON.stringify(result)}`);
  }

  await touchUsers([userId]);
  await touchSquaresGame(squaresGameId);
  const count = (squares as Square[]).length;
  await notify(userId, 'SQUARES_PURCHASE_CONFIRMED', 'Squares Purchased!',
    `You bought ${count} square${count > 1 ? 's' : ''} for ${ownerName.trim()} in "${game.title}".`, 'MEDIUM', { squaresGameId });

  const locked = (game.squaresSold ?? 0) + count >= GRID_SIZE ? await lockFullGrid(squaresGameId) : false;
  return { status: 'bought', squares: count, total: plan.total, balance, locked };
}

/** Lock a full grid with numbers drawn here. True if this call locked it. */
async function lockFullGrid(squaresGameId: string): Promise<boolean> {
  const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
  if (!game || game.status !== 'ACTIVE' || game.numbersAssigned || (game.squaresSold ?? 0) < GRID_SIZE) return false;
  const result = await applyLedger([], [planLock(squaresGameId, (max) => randomInt(max))]);
  if (result.status !== 'applied') return false; // the scheduled checker locked it first
  await touchSquaresGame(squaresGameId);
  const buyers = new Set((await listSquaresPurchases(squaresGameId)).map((p) => p.userId));
  for (const buyer of buyers) {
    await notify(buyer, 'SQUARES_GRID_LOCKED', 'Numbers Assigned!',
      `Grid is locked for "${game.title}". Numbers have been assigned. Good luck!`, 'HIGH', { squaresGameId });
  }
  return true;
}

/**
 * Cancel a game as its creator or an admin, refunding every buyer in the same ledger
 * transaction as the status change (squaresMoney.cancelSquaresGame). The creator's phone
 * used to compute and write the refunds.
 */
async function cancelSquaresGameFor(
  caller: Extract<Caller, { kind: 'user' }>,
  squaresGameId: string,
  reason: string | null | undefined
): Promise<{ status: 'cancelled'; refunded: number } | { status: 'refused'; reason: SquaresCancelRefusal }> {
  const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
  const payouts = game ? await listSquaresPayouts(squaresGameId) : [];
  const refusal = checkSquaresCancel(game, caller.sub, isAdmin(caller), payouts.length);
  if (refusal) return { status: 'refused', reason: refusal };

  const byCreator = game.creatorId === caller.sub;
  const why = (typeof reason === 'string' && reason.trim().slice(0, 200)) || (byCreator ? 'Cancelled by game creator' : 'Cancelled by admin');
  const purchases = await listSquaresPurchases(squaresGameId);
  const { outcome, refunds } = await cancelSquaresGame(
    (entries, stateUpdates) => applyLedger(entries, stateUpdates),
    squaresGameId,
    game.status,
    purchases,
    why
  );
  if (outcome.status === 'skipped') return { status: 'refused', reason: 'NOT_CANCELLABLE' };

  await touchUsers(refunds.map((r) => r.userId));
  await touchSquaresGame(squaresGameId);
  for (const { userId, amount } of refunds) {
    await notify(userId, 'SQUARES_GAME_CANCELLED', 'Game Cancelled',
      `"${game.title}" was cancelled. You received a $${amount.toFixed(2)} refund.`, 'MEDIUM', { squaresGameId });
  }
  return { status: 'cancelled', refunded: refunds.length };
}

interface SquaresPurchaseRow {
  id: string;
  userId: string;
  gridRow: number;
  gridCol: number;
  amount: number;
}

async function listSquaresPurchases(squaresGameId: string): Promise<SquaresPurchaseRow[]> {
  const rows: SquaresPurchaseRow[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.SquaresPurchase.purchasesBySquaresGame({ squaresGameId }, { nextToken });
    rows.push(...((page.data ?? []) as SquaresPurchaseRow[]));
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

async function listSquaresPayouts(squaresGameId: string): Promise<Array<{ id: string; period?: string | null }>> {
  const rows: Array<{ id: string; period?: string | null }> = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.SquaresPayout.payoutsBySquaresGame({ squaresGameId }, { nextToken });
    rows.push(...(page.data ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

/** The game was written directly; touch it so subscribers to SquaresGame.onUpdate see it. */
async function touchSquaresGame(id: string): Promise<void> {
  try {
    await client.models.SquaresGame.update({ id });
  } catch (error) {
    console.warn(`[Money] Could not notify subscribers for squares game ${id}:`, error);
  }
}

async function notify(
  userId: string,
  type: Parameters<typeof notificationMeta>[0],
  title: string,
  message: string,
  priority: 'LOW' | 'MEDIUM' | 'HIGH',
  actionData: Record<string, unknown>
): Promise<void> {
  try {
    await client.models.Notification.create({
      userId,
      type,
      ...notificationMeta(type),
      title,
      message,
      isRead: false,
      priority,
      actionData: JSON.stringify(actionData),
    });
  } catch (error) {
    console.warn(`[Money] ${type} notification failed for ${userId}:`, error);
  }
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

/** The same for a bet whose status the ledger changed (the app's Bet.onUpdate). */
async function touchBet(id: string): Promise<void> {
  try {
    await client.models.Bet.update({ id });
  } catch (error) {
    console.warn(`[Money] Could not notify subscribers for bet ${id}:`, error);
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

