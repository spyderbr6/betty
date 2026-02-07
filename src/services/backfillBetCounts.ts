/**
 * Backfill script for denormalized bet participant counts.
 *
 * Populates sideACount, sideBCount, and participantUserIds on existing Bet records
 * by querying their Participant records. This is a one-time migration utility.
 *
 * Can be triggered from the Admin Testing screen.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

interface BackfillResult {
  totalBets: number;
  updatedBets: number;
  skippedBets: number;
  errors: string[];
}

export async function backfillBetParticipantCounts(
  onProgress?: (message: string) => void
): Promise<BackfillResult> {
  const log = (msg: string) => {
    console.log(`[Backfill] ${msg}`);
    onProgress?.(msg);
  };

  const result: BackfillResult = {
    totalBets: 0,
    updatedBets: 0,
    skippedBets: 0,
    errors: [],
  };

  try {
    // Fetch all bets (ACTIVE and PENDING_RESOLUTION)
    log('Fetching ACTIVE bets...');
    const { data: activeBets } = await client.models.Bet.betsByStatus(
      { status: 'ACTIVE' as any },
      { limit: 500 }
    );

    log('Fetching PENDING_RESOLUTION bets...');
    const { data: pendingBets } = await client.models.Bet.betsByStatus(
      { status: 'PENDING_RESOLUTION' as any },
      { limit: 500 }
    );

    const allBets = [...(activeBets || []), ...(pendingBets || [])];
    result.totalBets = allBets.length;
    log(`Found ${allBets.length} bets to process`);

    for (const bet of allBets) {
      try {
        // Check if already backfilled (has participantUserIds populated)
        if (bet.participantUserIds && bet.participantUserIds.length > 0) {
          log(`Skipping bet ${bet.id} (${bet.title}) - already has participantUserIds`);
          result.skippedBets++;
          continue;
        }

        // Fetch all participants for this bet
        const { data: participants } = await client.models.Participant.list({
          filter: { betId: { eq: bet.id } },
        });

        if (!participants || participants.length === 0) {
          log(`Bet ${bet.id} (${bet.title}) - no participants found, setting counts to 0`);
          await client.models.Bet.update({
            id: bet.id,
            sideACount: 0,
            sideBCount: 0,
            participantUserIds: [],
          });
          result.updatedBets++;
          continue;
        }

        // Count by side and collect user IDs
        let sideACount = 0;
        let sideBCount = 0;
        const userIds: string[] = [];

        for (const participant of participants) {
          if (participant.userId) {
            userIds.push(participant.userId);
          }
          if (participant.side === 'A') {
            sideACount++;
          } else if (participant.side === 'B') {
            sideBCount++;
          }
        }

        log(`Updating bet ${bet.id} (${bet.title}): sideA=${sideACount}, sideB=${sideBCount}, users=${userIds.length}`);

        await client.models.Bet.update({
          id: bet.id,
          sideACount,
          sideBCount,
          participantUserIds: userIds,
        });

        result.updatedBets++;
      } catch (error: any) {
        const errMsg = `Error processing bet ${bet.id}: ${error.message || error}`;
        log(errMsg);
        result.errors.push(errMsg);
      }
    }

    log(`Backfill complete: ${result.updatedBets} updated, ${result.skippedBets} skipped, ${result.errors.length} errors`);
  } catch (error: any) {
    const errMsg = `Fatal error during backfill: ${error.message || error}`;
    log(errMsg);
    result.errors.push(errMsg);
  }

  return result;
}
