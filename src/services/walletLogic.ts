/**
 * What the requestWithdrawal and adminDecideTransaction mutations' answers mean for the
 * person acting, kept free of Amplify imports so it is unit tested. The server decides and
 * writes (amplify/shared/withdrawLogic.ts).
 */

export { newBetId as newRequestId } from './createBetLogic';

export type WithdrawResult =
  | { status: 'requested'; transactionId: string; amount: number; fee: number; net: number; balance: number }
  | {
      status: 'refused';
      reason: 'INVALID_AMOUNT' | 'BELOW_MINIMUM' | 'NO_METHOD' | 'INVALID_REQUEST' | 'INSUFFICIENT_FUNDS';
      balance?: number;
      required?: number;
      minimum?: number;
    };

export type DecideResult =
  | { status: 'decided'; outcome: 'COMPLETED' | 'FAILED'; userId: string; credited: number }
  | { status: 'refused'; reason: 'NOT_ADMIN' | 'NOT_FOUND' | 'NOT_PENDING' | 'NOT_DECIDABLE' | 'INVALID_AMOUNT' | 'INSUFFICIENT_FUNDS' };

/** The mutations return AWSJSON: an object, or JSON text (sometimes encoded twice). */
export function parseWalletResult<T extends { status: string }>(data: unknown, statuses: string[]): T | null {
  let value = data;
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const status = (value as { status?: unknown }).status;
  return typeof status === 'string' && statuses.includes(status) ? (value as T) : null;
}

/** Why a withdrawal request did not go through, or null when it did. */
export function withdrawProblem(result: WithdrawResult | null): { title: string; message: string } | null {
  if (result?.status === 'requested') return null;
  if (!result) return { title: 'Error', message: 'Failed to create withdrawal request. Please try again.' };
  switch (result.reason) {
    case 'INSUFFICIENT_FUNDS':
      return { title: 'Insufficient Balance', message: `You only have $${(result.balance ?? 0).toFixed(2)} available.` };
    case 'BELOW_MINIMUM':
      return { title: 'Invalid Amount', message: `Minimum withdrawal is $${(result.minimum ?? 0).toFixed(2)}.` };
    case 'NO_METHOD':
      return { title: 'Select Payment Method', message: 'Please choose one of your Venmo accounts.' };
    case 'INVALID_AMOUNT':
      return { title: 'Invalid Amount', message: 'Please enter a valid amount.' };
    default:
      return { title: 'Error', message: 'Failed to create withdrawal request. Please try again.' };
  }
}

/** Why an admin decision did not go through, or null when it did. */
export function decideProblem(result: DecideResult | null): string | null {
  if (result?.status === 'decided') return null;
  if (!result) return 'The decision could not be saved. Please try again.';
  switch (result.reason) {
    case 'NOT_ADMIN':
      return 'Your account is not in the admins group, so it cannot approve or reject transactions.';
    case 'NOT_PENDING':
      return 'This transaction has already been decided (or settled by Stripe).';
    case 'INSUFFICIENT_FUNDS':
      return "The user's balance no longer covers this withdrawal. Reject it instead.";
    case 'INVALID_AMOUNT':
      return 'The amount received must be more than $0 and no more than the amount requested.';
    default:
      return 'This transaction cannot be decided.';
  }
}
