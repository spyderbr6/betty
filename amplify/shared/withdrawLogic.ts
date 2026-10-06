/**
 * Withdrawals and admin decisions on deposits and withdrawals, decided and written on the
 * server (docs/SECURITY_PLAN.md step 3).
 *
 * Requesting a withdrawal used to only check the balance: the money came out when an
 * admin approved it, from the admin's phone with a read-then-write, so several requests
 * could together exceed the balance, and the balance could be bet away while a request
 * waited. Now the request itself takes the money (reserves it) in a ledger transaction,
 * and the decision either completes the request or gives the money back. "Admin" is the
 * Cognito admins group, checked by the server; it used to be a field users could write on
 * their own record.
 *
 * Pure, so it is unit tested; the money function reads the rows and applies the plan.
 */

import { MIN_WITHDRAWAL, withdrawalFee } from '../../src/config/subscriptionConfig';
import { roundMoney, toCents, type LedgerEntry } from './ledgerLogic';

export type WithdrawRefusal = 'INVALID_AMOUNT' | 'BELOW_MINIMUM' | 'NO_METHOD' | 'INVALID_REQUEST' | 'INSUFFICIENT_FUNDS';

export type WithdrawResult =
  | { status: 'requested'; transactionId: string; amount: number; fee: number; net: number; balance: number }
  | { status: 'refused'; reason: WithdrawRefusal; balance?: number; required?: number; minimum?: number };

export interface WithdrawMethod {
  id: string;
  userId?: string | null;
  type?: string | null;
  isActive?: boolean | null;
  venmoUsername?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ledger row of a request: reserved withdrawals carry this prefix. */
export const withdrawalTransactionId = (requestId: string) => `withdrawal#${requestId}`;
export const isReservedWithdrawal = (transactionId: string) => transactionId.startsWith('withdrawal#');

/**
 * Why this request cannot go ahead, or null. Any active Venmo account of the caller's
 * own: the admin checks the handle when approving (the owner's decision, 2026-10-05).
 */
export function checkWithdraw(params: {
  requestId: unknown;
  amount: unknown;
  method: WithdrawMethod | null | undefined;
  userId: string;
}): { reason: WithdrawRefusal; minimum?: number } | null {
  const { requestId, amount, method, userId } = params;
  if (typeof requestId !== 'string' || !UUID.test(requestId)) return { reason: 'INVALID_REQUEST' };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return { reason: 'INVALID_AMOUNT' };
  }
  if (amount < MIN_WITHDRAWAL) return { reason: 'BELOW_MINIMUM', minimum: MIN_WITHDRAWAL };
  if (!method || method.userId !== userId || method.isActive === false || method.type !== 'VENMO' || !method.venmoUsername) {
    return { reason: 'NO_METHOD' };
  }
  return null;
}

/** The request: the whole amount leaves the balance now, as a PENDING withdrawal. */
export function planWithdraw(params: {
  requestId: string;
  userId: string;
  amount: number;
  isPro: boolean;
  method: WithdrawMethod & { venmoUsername: string };
}): { entry: LedgerEntry; fee: number; net: number } {
  const amount = roundMoney(params.amount);
  const fee = withdrawalFee(amount, params.isPro);
  const net = (toCents(amount) - toCents(fee)) / 100;
  return {
    fee,
    net,
    entry: {
      transactionId: withdrawalTransactionId(params.requestId),
      userId: params.userId,
      type: 'WITHDRAWAL',
      status: 'PENDING',
      delta: -amount,
      amount,
      actualAmount: net,
      platformFee: fee,
      mode: 'create',
      paymentMethodId: params.method.id,
      venmoUsername: params.method.venmoUsername,
      notes: `Withdrawal to Venmo (@${params.method.venmoUsername})`,
    },
  };
}

export type DecideRefusal = 'NOT_FOUND' | 'NOT_PENDING' | 'NOT_DECIDABLE' | 'INVALID_AMOUNT' | 'INSUFFICIENT_FUNDS';

export interface DecideTransactionRow {
  id: string;
  userId?: string | null;
  type?: string | null;
  status?: string | null;
  amount?: number | null;
}

/**
 * An admin's decision on a pending deposit or withdrawal, as a ledger entry completing
 * the pending row:
 * - a reserved withdrawal (requested since this change): approve completes it, the money
 *   having left at request; reject returns the money.
 * - an older withdrawal, requested before reservation: approve takes the money now (and is
 *   refused if the balance no longer covers it); reject has nothing to return.
 * - a card deposit Stripe has not confirmed: approve credits it (the admin has checked the
 *   payment in Stripe), optionally a lower amount actually received; reject credits nothing.
 */
export function planDecide(params: {
  tx: DecideTransactionRow | null | undefined;
  approve: boolean;
  adminId: string;
  reason?: string | null;
  actualAmount?: number | null;
}): { entry: LedgerEntry } | { refused: DecideRefusal } {
  const { tx, approve, adminId } = params;
  if (!tx || !tx.userId) return { refused: 'NOT_FOUND' };
  if (tx.status !== 'PENDING') return { refused: 'NOT_PENDING' };
  if (tx.type !== 'WITHDRAWAL' && tx.type !== 'DEPOSIT') return { refused: 'NOT_DECIDABLE' };
  const amount = roundMoney(tx.amount ?? 0);
  const failureReason = approve ? undefined : (params.reason?.trim() || 'Rejected by admin').slice(0, 500);

  let delta = 0;
  let actualAmount: number | undefined;
  if (tx.type === 'WITHDRAWAL') {
    const reserved = isReservedWithdrawal(tx.id);
    if (approve && !reserved) delta = -amount; // requested before reservation: take it now
    if (!approve && reserved) delta = amount; // reserved at request: give it back
  } else if (approve) {
    const received = params.actualAmount ?? amount;
    if (typeof received !== 'number' || !Number.isFinite(received) || received <= 0 || received > amount) {
      return { refused: 'INVALID_AMOUNT' };
    }
    delta = roundMoney(received);
    actualAmount = delta;
  }

  return {
    entry: {
      transactionId: tx.id,
      userId: tx.userId,
      type: tx.type,
      status: approve ? 'COMPLETED' : 'FAILED',
      delta,
      amount,
      ...(actualAmount !== undefined ? { actualAmount } : {}),
      mode: 'completePending',
      processedBy: adminId,
      ...(failureReason ? { failureReason } : {}),
    },
  };
}
