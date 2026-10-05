/**
 * Joining a bet: the one path the app uses (the bet card and accepting an invitation).
 *
 * The server's joinBet mutation checks the join and writes the participant row, the
 * stake and the bet's counts in one transaction (docs/SECURITY_PLAN.md step 3). The app
 * used to make those writes itself, in three steps a failure could split.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { parseJoinResult, type JoinResult } from './joinBetLogic';

const client = generateClient<Schema>();

/** Null when the call itself failed (network, server error); the caller says so. */
export async function joinBet(betId: string, side: 'A' | 'B', amount: number): Promise<JoinResult | null> {
  try {
    const { data, errors } = await client.mutations.joinBet({ betId, side, amount });
    if (errors?.length) {
      console.error('[JoinBet] joinBet failed:', errors);
      return null;
    }
    return parseJoinResult(data);
  } catch (error) {
    console.error('[JoinBet] joinBet threw:', error);
    return null;
  }
}
