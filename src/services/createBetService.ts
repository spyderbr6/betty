/**
 * Creating a bet: the server's createBetWithStake mutation writes the bet, the creator's
 * participant row and their stake in one transaction (docs/SECURITY_PLAN.md step 3). The
 * app used to make those writes itself and delete them again when a later one failed.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { parseCreateBetResult, type CreateBetResult } from './createBetLogic';

const client = generateClient<Schema>();

export interface CreateBetRequest {
  betId: string;
  title: string;
  description: string;
  category: string;
  amount: number;
  side: 'A' | 'B';
  sideAName: string;
  sideBName: string;
  deadlineMinutes: number;
  isPrivate: boolean;
  eventId?: string;
}

/** Null when the call itself failed (network, server error); the caller says so. */
export async function createBetWithStake(request: CreateBetRequest): Promise<CreateBetResult | null> {
  try {
    const { data, errors } = await client.mutations.createBetWithStake(request);
    if (errors?.length) {
      console.error('[CreateBet] createBetWithStake failed:', errors);
      return null;
    }
    return parseCreateBetResult(data);
  } catch (error) {
    console.error('[CreateBet] createBetWithStake threw:', error);
    return null;
  }
}
