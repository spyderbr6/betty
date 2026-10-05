import { describe, expect, it } from 'vitest';
import {
  classifyCancellation,
  planLedgerWrite,
  roundMoney,
  type LedgerEntry,
  type TableNames,
  type TransactItem,
} from '../ledgerLogic';

const tables: TableNames = {
  User: 'User-t',
  Transaction: 'Transaction-t',
  Bet: 'Bet-t',
  Participant: 'Participant-t',
  SquaresGame: 'SquaresGame-t',
  SquaresPurchase: 'SquaresPurchase-t',
};

const NOW = '2026-10-04T12:00:00.000Z';

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  transactionId: 'stake#p-1',
  userId: 'u-1',
  type: 'BET_PLACED',
  delta: -10,
  amount: 10,
  status: 'COMPLETED',
  mode: 'create',
  ...over,
});

const ok = (plan: ReturnType<typeof planLedgerWrite>) => {
  if (!plan.ok) throw new Error(`expected ok, got ${JSON.stringify(plan)}`);
  return plan;
};

const userUpdates = (items: TransactItem[]) =>
  items.filter((i): i is Extract<TransactItem, { Update: unknown }> => 'Update' in i && i.Update.TableName === tables.User);

const ledgerRows = (items: TransactItem[]) =>
  items.filter((i) => ('Put' in i ? i.Put.TableName : i.Update.TableName) === tables.Transaction);

describe('planLedgerWrite', () => {
  it('debits with a compare-and-swap on the balance it read', () => {
    const plan = ok(planLedgerWrite({ entries: [entry()], balances: { 'u-1': 50 }, now: NOW }, tables));
    const [update] = userUpdates(plan.items);
    expect(update.Update.ConditionExpression).toContain('#balance = :before');
    expect(update.Update.ExpressionAttributeValues).toMatchObject({ ':before': 50, ':after': 40 });
    expect(plan.balances).toEqual([{ userId: 'u-1', before: 50, after: 40 }]);
  });

  it('refuses a debit that would take the balance below zero', () => {
    const plan = planLedgerWrite({ entries: [entry({ delta: -60, amount: 60 })], balances: { 'u-1': 50 }, now: NOW }, tables);
    expect(plan).toEqual({ ok: false, reason: 'INSUFFICIENT_FUNDS', userId: 'u-1', balance: 50, required: 60 });
  });

  it('allows a debit to exactly zero', () => {
    const plan = ok(planLedgerWrite({ entries: [entry({ delta: -50, amount: 50 })], balances: { 'u-1': 50 }, now: NOW }, tables));
    expect(plan.balances[0].after).toBe(0);
  });

  it('writes a new ledger row only if its id does not exist (idempotency)', () => {
    const plan = ok(planLedgerWrite({ entries: [entry()], balances: { 'u-1': 50 }, now: NOW }, tables));
    const [row] = ledgerRows(plan.items);
    expect('Put' in row && row.Put.ConditionExpression).toBe('attribute_not_exists(#id)');
    expect('Put' in row && row.Put.Item).toMatchObject({
      id: 'stake#p-1',
      __typename: 'Transaction',
      userId: 'u-1',
      type: 'BET_PLACED',
      amount: 10,
      balanceBefore: 50,
      balanceAfter: 40,
      createdAt: NOW,
      completedAt: NOW,
    });
  });

  it('completes a pending row only while it is still PENDING', () => {
    const plan = ok(
      planLedgerWrite(
        { entries: [entry({ transactionId: 'tx-dep', type: 'DEPOSIT', delta: 25, amount: 25, mode: 'completePending' })], balances: { 'u-1': 0 }, now: NOW },
        tables
      )
    );
    const [row] = ledgerRows(plan.items);
    expect('Update' in row && row.Update.ConditionExpression).toBe('attribute_exists(#id) AND #status = :pending');
    // createdAt is the history's sort key; completing must not move the row
    expect('Update' in row && row.Update.UpdateExpression).not.toContain('createdAt');
  });

  it('keeps the fee a pending row recorded when the entry states none', () => {
    // A card deposit's PENDING row holds its processing fee; completing it must not zero it
    const plan = ok(
      planLedgerWrite(
        { entries: [entry({ transactionId: 'tx-dep', type: 'DEPOSIT', delta: 25, amount: 25, mode: 'completePending' })], balances: { 'u-1': 0 }, now: NOW },
        tables
      )
    );
    const [row] = ledgerRows(plan.items);
    expect('Update' in row && row.Update.UpdateExpression).not.toContain('#platformFee');
  });

  it('writes a stated fee when completing, and a zero fee on a new row', () => {
    const completed = ok(
      planLedgerWrite(
        { entries: [entry({ transactionId: 'payout#p-1', type: 'BET_WON', delta: 0, amount: 0, platformFee: 0, mode: 'upsertPending' })], balances: { 'u-1': 0 }, now: NOW },
        tables
      )
    );
    const [completedRow] = ledgerRows(completed.items);
    expect('Update' in completedRow && completedRow.Update.ExpressionAttributeValues).toMatchObject({ ':platformFee': 0 });

    const created = ok(planLedgerWrite({ entries: [entry()], balances: { 'u-1': 50 }, now: NOW }, tables));
    const [createdRow] = ledgerRows(created.items);
    expect('Put' in createdRow && createdRow.Put.Item.platformFee).toBe(0);
  });

  it('upserts a payout: completes it if pending, creates it if absent', () => {
    const plan = ok(
      planLedgerWrite(
        { entries: [entry({ transactionId: 'payout#p-1', type: 'BET_WON', delta: 19, amount: 20, actualAmount: 19, platformFee: 1, mode: 'upsertPending' })], balances: { 'u-1': 0 }, now: NOW },
        tables
      )
    );
    const [row] = ledgerRows(plan.items);
    expect('Update' in row && row.Update.ConditionExpression).toBe('attribute_not_exists(#id) OR #status = :pending');
    expect('Update' in row && row.Update.UpdateExpression).toContain('if_not_exists(#createdAt, :now)');
  });

  it('treats a missing balance attribute as the schema default of 0', () => {
    const plan = ok(planLedgerWrite({ entries: [entry({ type: 'DEPOSIT', delta: 5, amount: 5 })], balances: { 'u-1': 0 }, now: NOW }, tables));
    expect(userUpdates(plan.items)[0].Update.ConditionExpression).toContain('attribute_not_exists(#balance)');
  });

  it('combines several entries for one user into one balance write, rows chained', () => {
    const plan = ok(
      planLedgerWrite(
        {
          entries: [
            entry({ transactionId: 'a', type: 'BET_CANCELLED', delta: 10, amount: 10 }),
            entry({ transactionId: 'b', type: 'BET_CANCELLED', delta: 5, amount: 5 }),
          ],
          balances: { 'u-1': 1 },
          now: NOW,
        },
        tables
      )
    );
    expect(userUpdates(plan.items)).toHaveLength(1);
    expect(userUpdates(plan.items)[0].Update.ExpressionAttributeValues).toMatchObject({ ':before': 1, ':after': 16 });
    const rows = ledgerRows(plan.items).map((r) => ('Put' in r ? r.Put.Item : {}));
    expect(rows.map((r) => [r.balanceBefore, r.balanceAfter])).toEqual([[1, 11], [11, 16]]);
  });

  it('records a zero-amount entry without touching the balance', () => {
    const plan = ok(planLedgerWrite({ entries: [entry({ type: 'BET_LOST', delta: 0, amount: 0 })], balances: { 'u-1': 7 }, now: NOW }, tables));
    // The old client path rewrote the loser's balance here, with a value read earlier
    expect(userUpdates(plan.items)).toHaveLength(0);
    expect(ledgerRows(plan.items)).toHaveLength(1);
  });

  it('rounds away floating-point drift', () => {
    const plan = ok(planLedgerWrite({ entries: [entry({ type: 'DEPOSIT', delta: 0.1, amount: 0.1 }), entry({ transactionId: 'x', type: 'DEPOSIT', delta: 0.2, amount: 0.2 })], balances: { 'u-1': 0 }, now: NOW }, tables));
    expect(plan.balances[0].after).toBe(0.3);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('includes guarded state changes in the same transaction', () => {
    const plan = ok(
      planLedgerWrite(
        {
          entries: [entry({ transactionId: 'payout#p-1', type: 'BET_WON', delta: 20, amount: 20, mode: 'upsertPending' })],
          balances: { 'u-1': 0 },
          stateUpdates: [{ table: 'Participant', id: 'p-1', set: { payoutStatus: 'PAID' }, expect: { payoutStatus: null } }],
          now: NOW,
        },
        tables
      )
    );
    const state = plan.items.find((i) => 'Update' in i && i.Update.TableName === tables.Participant);
    expect(state && 'Update' in state && state.Update.ConditionExpression).toBe('attribute_exists(#id) AND attribute_not_exists(#e_payoutStatus)');
  });

  const stateItem = (stateUpdates: Parameters<typeof planLedgerWrite>[0]['stateUpdates']) => {
    const plan = ok(planLedgerWrite({ entries: [entry()], balances: { 'u-1': 50 }, stateUpdates, now: NOW }, tables));
    const item = plan.items.find((i) => 'Update' in i && i.Update.TableName !== tables.User && i.Update.TableName !== tables.Transaction);
    if (!item || !('Update' in item)) throw new Error('no state item');
    return item.Update;
  };

  it('creates an item only if its id is free, with createdAt and __typename', () => {
    const update = stateItem([{ table: 'Participant', id: 'bet-1#u-1', set: { betId: 'bet-1' }, create: { typename: 'Participant' } }]);
    expect(update.ConditionExpression).toBe('attribute_not_exists(#id)');
    expect(update.UpdateExpression).toContain('#createdAt = :now');
    expect(update.ExpressionAttributeValues).toMatchObject({ ':typename': 'Participant', ':now': NOW, ':s_betId': 'bet-1' });
  });

  it('adds to counters and appends to lists, treating missing ones as empty', () => {
    const update = stateItem([{ table: 'Bet', id: 'bet-1', set: {}, add: { sideACount: 1, totalPot: 25 }, append: { participantUserIds: ['u-1'] } }]);
    expect(update.UpdateExpression).toContain('#a_sideACount = if_not_exists(#a_sideACount, :zero) + :a_sideACount');
    expect(update.UpdateExpression).toContain('#l_participantUserIds = list_append(if_not_exists(#l_participantUserIds, :emptyList), :l_participantUserIds)');
    expect(update.ExpressionAttributeValues).toMatchObject({ ':a_totalPot': 25, ':l_participantUserIds': ['u-1'], ':zero': 0, ':emptyList': [] });
  });

  it('can require a time still ahead (a deadline not yet passed)', () => {
    const update = stateItem([{ table: 'Bet', id: 'bet-1', set: {}, add: { sideACount: 1 }, expect: { status: 'ACTIVE' }, expectAfter: { deadline: NOW } }]);
    expect(update.ConditionExpression).toBe('attribute_exists(#id) AND #g_deadline > :g_deadline AND #e_status = :e_status');
    expect(update.ExpressionAttributeValues).toMatchObject({ ':g_deadline': NOW, ':e_status': 'ACTIVE' });
  });

  it('refuses two updates to one item, or one attribute written two ways', () => {
    const plan = (stateUpdates: Parameters<typeof planLedgerWrite>[0]['stateUpdates']) =>
      planLedgerWrite({ entries: [], balances: {}, stateUpdates, now: NOW }, tables);
    expect(plan([{ table: 'Bet', id: 'b', set: { a: 1 } }, { table: 'Bet', id: 'b', set: { c: 1 } }])).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(plan([{ table: 'Bet', id: 'b', set: { n: 1 }, add: { n: 1 } }])).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(plan([{ table: 'Bet', id: 'b', set: { updatedAt: 'x' } }])).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(plan([{ table: 'Participant', id: 'p', set: { createdAt: 'x' }, create: { typename: 'Participant' } }])).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(plan([{ table: 'Bet', id: 'b', set: {}, add: { n: Number.NaN } }])).toMatchObject({ ok: false, reason: 'INVALID' });
  });

  it('refuses invalid input', () => {
    expect(planLedgerWrite({ entries: [entry(), entry()], balances: { 'u-1': 50 }, now: NOW }, tables)).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(planLedgerWrite({ entries: [entry({ amount: -1 })], balances: { 'u-1': 50 }, now: NOW }, tables)).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(planLedgerWrite({ entries: [entry({ delta: Number.NaN })], balances: { 'u-1': 50 }, now: NOW }, tables)).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(planLedgerWrite({ entries: [entry()], balances: {}, now: NOW }, tables)).toEqual({ ok: false, reason: 'UNKNOWN_USER', userId: 'u-1' });
    expect(
      planLedgerWrite({ entries: [entry()], balances: { 'u-1': 50 }, stateUpdates: [{ table: 'User', id: 'u-1', set: { role: 'X' } }], now: NOW }, tables)
    ).toMatchObject({ ok: false, reason: 'INVALID' });
  });

  it('refuses a write over the DynamoDB transaction limit', () => {
    const entries = Array.from({ length: 51 }, (_, i) => entry({ transactionId: `t${i}`, userId: `u${i}`, type: 'DEPOSIT', delta: 1, amount: 1 }));
    const balances = Object.fromEntries(entries.map((e) => [e.userId, 0]));
    expect(planLedgerWrite({ entries, balances, now: NOW }, tables)).toMatchObject({ ok: false, reason: 'TOO_MANY_ITEMS', count: 102 });
  });
});

describe('classifyCancellation', () => {
  const plan = ok(
    planLedgerWrite(
      {
        entries: [entry({ transactionId: 'payout#p-1', type: 'BET_WON', delta: 20, amount: 20, mode: 'upsertPending' })],
        balances: { 'u-1': 0 },
        stateUpdates: [{ table: 'Bet', id: 'b-1', set: { status: 'RESOLVED' }, expect: { status: 'PENDING_RESOLUTION' } }],
        now: NOW,
      },
      tables
    )
  );
  // Items in order: user balance, ledger row, bet state
  const failAt = (...indexes: number[]) => plan.items.map((_, i) => (indexes.includes(i) ? { Code: 'ConditionalCheckFailed' } : { Code: 'None' }));

  it('says retry when only the balance moved', () => {
    expect(classifyCancellation(plan, failAt(0), tables)).toBe('balance_changed');
  });

  it('says already applied when the ledger row exists, whatever else failed', () => {
    expect(classifyCancellation(plan, failAt(1), tables)).toBe('already_applied');
    expect(classifyCancellation(plan, failAt(0, 1, 2), tables)).toBe('already_applied');
  });

  it('says stop when guarded state moved on', () => {
    expect(classifyCancellation(plan, failAt(2), tables)).toBe('state_changed');
  });

  it('says other for anything else (throttling, conflicts)', () => {
    expect(classifyCancellation(plan, plan.items.map(() => ({ Code: 'TransactionConflict' })), tables)).toBe('other');
  });
});
