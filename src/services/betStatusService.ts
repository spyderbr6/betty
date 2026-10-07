/**
 * Ending a bet early and disputing a result: the server's endBetEarly and fileDispute
 * mutations check the caller and write the bet's new status (docs/SECURITY_PLAN.md step 5).
 * The app used to write Bet.status itself.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { parseStatusResult, type EndEarlyResult, type FileDisputeResult } from './betStatusLogic';

const client = generateClient<Schema>();

/** Null when the call itself failed (network, server error). */
export async function endBetEarly(betId: string): Promise<EndEarlyResult | null> {
  try {
    const { data, errors } = await client.mutations.endBetEarly({ betId });
    if (errors?.length) {
      console.error('[BetStatus] endBetEarly failed:', errors);
      return null;
    }
    return parseStatusResult<EndEarlyResult>(data, ['ended', 'refused']);
  } catch (error) {
    console.error('[BetStatus] endBetEarly threw:', error);
    return null;
  }
}

/** Null when the call itself failed (network, server error). */
export async function fileDispute(params: {
  betId: string;
  reason: string;
  description: string;
  evidenceUrls?: string[];
}): Promise<FileDisputeResult | null> {
  try {
    const { data, errors } = await client.mutations.fileDispute(params);
    if (errors?.length) {
      console.error('[BetStatus] fileDispute failed:', errors);
      return null;
    }
    return parseStatusResult<FileDisputeResult>(data, ['filed', 'refused']);
  } catch (error) {
    console.error('[BetStatus] fileDispute threw:', error);
    return null;
  }
}
