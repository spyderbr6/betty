import { describe, expect, it } from 'vitest';
import { cancelExpiredBet, REFUNDS_PER_TRANSACTION, type ApplyLedger } from '../cancelExpired';
import type { LedgerEntry, LedgerResult, StateUpdate } from '../../../shared/ledgerLogic';
import type { Refund } from '../expiryLogic';

type Call = { entries: LedgerEntry[]; stateUpdates: StateUpdate[] };

/** A fake ledger that records each call and answers from a script. */
function fakeLedger(answers: LedgerResult[]) {
  const calls: Call[] = [];
  const apply: ApplyLedger = async (entries, stateUpdates = []) => {
    calls.push({ entries, stateUpdates });
    return answers.shift() ?? { status: 'applied', balances: [] };
  };
  return { apply, calls };
}

const refunds = (n: number): Refund[] =>
  Array.from({ length: n }, (_, i) => ({ participantId: `p-${i}`, userId: `u-${i}`, amount: 10 }));

describe('cancelExpiredBet', () => {
  it('refunds every stake and cancels the bet in one transaction', async () => {
    const { apply, calls } = fakeLedger([{ status: 'applied', balances: [] }]);
    const outcome = await cancelExpiredBet(apply, 'bet-1', refunds(2), 'nobody joined');

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(calls).toHaveLength(1);
    expect(calls[0].entries.map((e) => e.transactionId)).toEqual(['refund#p-0', 'refund#p-1']);
    expect(calls[0].stateUpdates).toEqual([
      { table: 'Bet', id: 'bet-1', set: { status: 'CANCELLED', resolutionReason: 'nobody joined' }, expect: { status: 'ACTIVE' } },
    ]);
  });

  it('never moves money without cancelling the bet in the same write', async () => {
    // The hole this closes: stakes returned while the bet stayed ACTIVE and joinable
    const { apply, calls } = fakeLedger([{ status: 'applied', balances: [] }]);
    await cancelExpiredBet(apply, 'bet-1', refunds(REFUNDS_PER_TRANSACTION), 'nobody joined');
    for (const call of calls) {
      if (call.entries.length) expect(call.stateUpdates.map((s) => s.set.status)).toContain('CANCELLED');
    }
  });

  it('leaves the bet for the next run when the write is refused', async () => {
    const { apply } = fakeLedger([{ status: 'rejected', reason: 'boom' }]);
    await expect(cancelExpiredBet(apply, 'bet-1', refunds(1), 'r')).rejects.toThrow(/refused/);
  });

  it('skips a bet that is no longer ACTIVE', async () => {
    const { apply, calls } = fakeLedger([{ status: 'state_changed' }]);
    expect(await cancelExpiredBet(apply, 'bet-1', refunds(1), 'r')).toEqual({ status: 'skipped', reason: 'no longer in the expected state' });
    expect(calls).toHaveLength(1);
  });

  it('confirms the cancellation without refunding again when the refunds already exist', async () => {
    const { apply, calls } = fakeLedger([{ status: 'already_applied' }, { status: 'state_changed' }]);
    expect(await cancelExpiredBet(apply, 'bet-1', refunds(1), 'r')).toEqual({ status: 'skipped', reason: 'already cancelled' });
    expect(calls[1].entries).toEqual([]);
  });

  it('cancels a bet with no stakes to return', async () => {
    const { apply, calls } = fakeLedger([{ status: 'applied', balances: [] }]);
    expect(await cancelExpiredBet(apply, 'bet-1', [], 'r')).toEqual({ status: 'cancelled' });
    expect(calls[0].entries).toEqual([]);
    expect(calls[0].stateUpdates).toHaveLength(1);
  });

  it('with more stakes than fit, cancels first, then refunds in batches', async () => {
    const { apply, calls } = fakeLedger([]);
    const outcome = await cancelExpiredBet(apply, 'bet-1', refunds(REFUNDS_PER_TRANSACTION + 1), 'r');

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(calls[0]).toEqual({ entries: [], stateUpdates: [expect.objectContaining({ set: expect.objectContaining({ status: 'CANCELLED' }) })] });
    expect(calls.slice(1).map((c) => c.entries.length)).toEqual([REFUNDS_PER_TRANSACTION, 1]);
  });

  it('with more stakes than fit, refunds nothing if the bet cannot be cancelled', async () => {
    const { apply, calls } = fakeLedger([{ status: 'state_changed' }]);
    expect((await cancelExpiredBet(apply, 'bet-1', refunds(REFUNDS_PER_TRANSACTION + 1), 'r')).status).toBe('skipped');
    expect(calls).toHaveLength(1);
  });

  it('reports a failed batch after trying the rest', async () => {
    const { apply, calls } = fakeLedger([
      { status: 'applied', balances: [] },
      { status: 'rejected', reason: 'boom' },
      { status: 'applied', balances: [] },
    ]);
    await expect(cancelExpiredBet(apply, 'bet-1', refunds(REFUNDS_PER_TRANSACTION + 1), 'r')).rejects.toThrow(/refunds failed/);
    expect(calls).toHaveLength(3);
  });
});
