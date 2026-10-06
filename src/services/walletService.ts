/**
 * Withdrawals and the admin's decisions on deposits and withdrawals, through the server
 * (docs/SECURITY_PLAN.md step 3). The app used to write these itself: the admin's phone
 * moved the balance on approval, and "admin" was a field users could write.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { parseWalletResult, type DecideResult, type WithdrawResult } from './walletLogic';

const client = generateClient<Schema>();

/** Null when the call itself failed (network, server error); the caller says so. */
export async function requestWithdrawal(request: {
  requestId: string;
  amount: number;
  paymentMethodId: string;
}): Promise<WithdrawResult | null> {
  try {
    const { data, errors } = await client.mutations.requestWithdrawal(request);
    if (errors?.length) {
      console.error('[Wallet] requestWithdrawal failed:', errors);
      return null;
    }
    return parseWalletResult<WithdrawResult>(data, ['requested', 'refused']);
  } catch (error) {
    console.error('[Wallet] requestWithdrawal threw:', error);
    return null;
  }
}

/** Null when the call itself failed; the caller says so. */
export async function adminDecideTransaction(decision: {
  transactionId: string;
  approve: boolean;
  reason?: string;
  actualAmount?: number;
}): Promise<DecideResult | null> {
  try {
    const { data, errors } = await client.mutations.adminDecideTransaction(decision);
    if (errors?.length) {
      console.error('[Wallet] adminDecideTransaction failed:', errors);
      return null;
    }
    return parseWalletResult<DecideResult>(data, ['decided', 'refused']);
  } catch (error) {
    console.error('[Wallet] adminDecideTransaction threw:', error);
    return null;
  }
}
