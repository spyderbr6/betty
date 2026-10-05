/**
 * Resolving a bet: the server's resolveBet mutation checks the caller is the creator,
 * computes the payouts from the stakes and records the result (docs/SECURITY_PLAN.md
 * step 3). The creator's phone used to compute and write all of it.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { parseResolveResult, type ResolveResult } from './resolveBetLogic';

const client = generateClient<Schema>();

/** Null when the call itself failed (network, server error); the caller says so. */
export async function resolveBet(betId: string, winningSide: 'A' | 'B'): Promise<ResolveResult | null> {
  try {
    const { data, errors } = await client.mutations.resolveBet({ betId, winningSide });
    if (errors?.length) {
      console.error('[ResolveBet] resolveBet failed:', errors);
      return null;
    }
    return parseResolveResult(data);
  } catch (error) {
    console.error('[ResolveBet] resolveBet threw:', error);
    return null;
  }
}
