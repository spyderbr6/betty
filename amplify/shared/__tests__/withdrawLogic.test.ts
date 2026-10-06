import { describe, expect, it } from 'vitest';
import { checkWithdraw, planDecide, planWithdraw, withdrawalTransactionId } from '../withdrawLogic';
import { MIN_WITHDRAWAL, WITHDRAWAL_FEE_RATE, withdrawalFee } from '../../../src/config/subscriptionConfig';

const REQ = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const method = (over: Record<string, unknown> = {}) => ({ id: 'pm-1', userId: 'u1', type: 'VENMO', isActive: true, venmoUsername: 'pat-v', ...over });

describe('checkWithdraw', () => {
  const check = (over: Partial<Parameters<typeof checkWithdraw>[0]> = {}) =>
    checkWithdraw({ requestId: REQ, amount: 50, method: method(), userId: 'u1', ...over });

  it('accepts any active Venmo account of the caller\'s own, verified or not', () => {
    expect(check()).toBeNull();
    expect(check({ method: method({ isVerified: false }) })).toBeNull();
  });

  it('refuses someone else\'s account, an inactive one, or one without a handle', () => {
    expect(check({ method: method({ userId: 'u2' }) })).toEqual({ reason: 'NO_METHOD' });
    expect(check({ method: method({ isActive: false }) })).toEqual({ reason: 'NO_METHOD' });
    expect(check({ method: method({ venmoUsername: '' }) })).toEqual({ reason: 'NO_METHOD' });
    expect(check({ method: null })).toEqual({ reason: 'NO_METHOD' });
  });

  it('refuses amounts that are not positive cents, or under the minimum', () => {
    for (const amount of [0, -5, Number.NaN, 10.005, '50']) expect(check({ amount })).toEqual({ reason: 'INVALID_AMOUNT' });
    expect(check({ amount: MIN_WITHDRAWAL - 0.01 })).toEqual({ reason: 'BELOW_MINIMUM', minimum: MIN_WITHDRAWAL });
  });

  it('needs a request id, so a repeated request reaches the same withdrawal', () => {
    expect(check({ requestId: 'abc' })).toEqual({ reason: 'INVALID_REQUEST' });
  });
});

describe('planWithdraw', () => {
  it('takes the whole amount now, recording the fee and what will be sent', () => {
    const plan = planWithdraw({ requestId: REQ, userId: 'u1', amount: 50, isPro: false, method: method() as never });
    const fee = Math.round(50 * WITHDRAWAL_FEE_RATE * 100) / 100;
    expect(plan.fee).toBe(fee);
    expect(plan.net).toBe(50 - fee);
    expect(plan.entry).toMatchObject({
      transactionId: withdrawalTransactionId(REQ),
      userId: 'u1',
      type: 'WITHDRAWAL',
      status: 'PENDING',
      delta: -50,
      amount: 50,
      actualAmount: 50 - fee,
      platformFee: fee,
      mode: 'create',
      paymentMethodId: 'pm-1',
      venmoUsername: 'pat-v',
    });
  });

  it('waives the fee for Pro, the same figure the confirmation screen shows', () => {
    const plan = planWithdraw({ requestId: REQ, userId: 'u1', amount: 50, isPro: true, method: method() as never });
    expect(plan.fee).toBe(0);
    expect(plan.fee).toBe(withdrawalFee(50, true));
    expect(withdrawalFee(50, false)).toBe(1);
  });
});

describe('planDecide', () => {
  const reserved = { id: withdrawalTransactionId(REQ), userId: 'u1', type: 'WITHDRAWAL', status: 'PENDING', amount: 50 };
  const legacy = { id: 'random-old-id', userId: 'u1', type: 'WITHDRAWAL', status: 'PENDING', amount: 50 };
  const deposit = { id: 'dep-1', userId: 'u1', type: 'DEPOSIT', status: 'PENDING', amount: 25 };
  const entryOf = (r: ReturnType<typeof planDecide>) => {
    if (!('entry' in r)) throw new Error(`refused: ${JSON.stringify(r)}`);
    return r.entry;
  };

  it('approving a reserved withdrawal completes it without taking the money again', () => {
    expect(entryOf(planDecide({ tx: reserved, approve: true, adminId: 'admin' }))).toMatchObject({
      transactionId: reserved.id, status: 'COMPLETED', delta: 0, mode: 'completePending', processedBy: 'admin',
    });
  });

  it('rejecting a reserved withdrawal gives the money back', () => {
    expect(entryOf(planDecide({ tx: reserved, approve: false, adminId: 'admin', reason: 'Wrong handle' }))).toMatchObject({
      status: 'FAILED', delta: 50, failureReason: 'Wrong handle',
    });
  });

  it('an older withdrawal, never reserved, takes the money on approval and returns none on rejection', () => {
    expect(entryOf(planDecide({ tx: legacy, approve: true, adminId: 'admin' })).delta).toBe(-50);
    expect(entryOf(planDecide({ tx: legacy, approve: false, adminId: 'admin' })).delta).toBe(0);
  });

  it('approving a deposit credits it, or the lower amount actually received', () => {
    expect(entryOf(planDecide({ tx: deposit, approve: true, adminId: 'admin' }))).toMatchObject({ status: 'COMPLETED', delta: 25, actualAmount: 25 });
    expect(entryOf(planDecide({ tx: deposit, approve: true, adminId: 'admin', actualAmount: 24.1 })).delta).toBe(24.1);
    expect(planDecide({ tx: deposit, approve: true, adminId: 'admin', actualAmount: 30 })).toEqual({ refused: 'INVALID_AMOUNT' });
    expect(entryOf(planDecide({ tx: deposit, approve: false, adminId: 'admin' })).delta).toBe(0);
  });

  it('decides only pending deposits and withdrawals', () => {
    expect(planDecide({ tx: { ...reserved, status: 'COMPLETED' }, approve: true, adminId: 'admin' })).toEqual({ refused: 'NOT_PENDING' });
    expect(planDecide({ tx: { ...deposit, type: 'BET_WON' }, approve: true, adminId: 'admin' })).toEqual({ refused: 'NOT_DECIDABLE' });
    expect(planDecide({ tx: null, approve: true, adminId: 'admin' })).toEqual({ refused: 'NOT_FOUND' });
  });
});
