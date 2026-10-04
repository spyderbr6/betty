import { EventBridgeHandler } from 'aws-lambda';
import { decideExpiry } from './expiryLogic';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/scheduled-bet-checker';
import { notificationMeta } from '../../shared/notificationCatalog';
import { ledgerApply } from '../../shared/moneyClient';
import { cancelExpiredBet } from './cancelExpired';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

export const handler: EventBridgeHandler<"Scheduled Event", null, boolean> = async (event) => {
  console.log('⏰ Scheduled bet checker triggered:', JSON.stringify(event, null, 2));

  try {
    const result = await updateExpiredBets();

    console.log(`✅ Scheduled bet check completed: ${JSON.stringify(result)}`);
    return true;

  } catch (error) {
    console.error('❌ Scheduled bet check failed:', error);
    return false;
  }
};

/**
 * Check and update expired bets from ACTIVE to PENDING_RESOLUTION or CANCELLED
 */
async function updateExpiredBets(): Promise<{ updated: number; cancelled: number; errors: number; checkedCount: number }> {
  let updated = 0;
  let cancelled = 0;
  let errors = 0;

  try {
    console.log('🕐 [Scheduled] Checking for expired ACTIVE bets...');

    const now = new Date();
    const currentISOString = now.toISOString();

    // Every page of ACTIVE bets through the GSI, then filter by deadline. One page could
    // leave expired bets, and the stakes they hold, waiting indefinitely.
    const activeBets: any[] = [];
    let nextToken: string | null | undefined;
    do {
      const page = await client.models.Bet.betsByStatus({ status: 'ACTIVE' }, { nextToken });
      activeBets.push(...(page.data ?? []));
      nextToken = page.nextToken;
    } while (nextToken);
    const expiredActiveBets = activeBets?.filter((bet: any) => bet.deadline && bet.deadline < currentISOString) || [];

    if (!expiredActiveBets || expiredActiveBets.length === 0) {
      console.log('✅ [Scheduled] No expired active bets found');
      return { updated: 0, cancelled: 0, errors: 0, checkedCount: 0 };
    }

    console.log(`📊 [Scheduled] Found ${expiredActiveBets.length} expired ACTIVE bets to process`);

    // Log each expired bet for debugging
    expiredActiveBets.forEach((bet: any) => {
      if (bet.deadline) {
        const deadline = new Date(bet.deadline);
        const minutesAgo = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60));
        console.log(`🕐 Bet "${bet.title}" (${bet.id}) expired ${minutesAgo} minutes ago`);
      }
    });

    // Process each expired bet
    for (const bet of expiredActiveBets) {
      try {
        if (!bet.id) {
          console.error('❌ Bet missing ID, skipping');
          errors++;
          continue;
        }

        // Indexed; this was a filtered Scan per expired bet.
        const { data: participants } = await client.models.Participant.participantsByBet({
          betId: bet.id
        });

        const outcome = decideExpiry(bet.creatorId, participants);

        if (outcome.action === 'RESOLVE') {
          await client.models.Bet.update({
            id: bet.id,
            status: 'PENDING_RESOLUTION'
          });

          updated++;
        } else {
          // Every stake is returned and the bet cancelled in one ledger transaction (the
          // money function); see cancelExpired.ts. This used to cancel and then refund by
          // reading and writing balances, so a concurrent write could be lost.
          const cancellation = await cancelExpiredBet(
            (entries, stateUpdates) => ledgerApply(client, entries, stateUpdates),
            bet.id,
            outcome.refunds,
            outcome.reason
          );
          if (cancellation.status === 'skipped') {
            console.log(`⏭️ [Scheduled] Bet ${bet.id} not cancelled: ${cancellation.reason}`);
            continue;
          }
          console.log(`💸 [Scheduled] Cancelled bet ${bet.id}, ${outcome.refunds.length} stake(s) returned`);

          // The ledger wrote the bet directly, which fires no subscription; touch it
          // through AppSync so open apps see the cancellation
          try {
            await client.models.Bet.update({ id: bet.id });
          } catch (touchError) {
            console.warn(`Could not notify subscribers for bet ${bet.id}:`, touchError);
          }

          // Notify bet creator that their bet was cancelled
          try {
            await client.models.Notification.create({
              userId: bet.creatorId!,
              type: 'BET_CANCELLED',
              ...notificationMeta('BET_CANCELLED'),
              title: 'Bet Cancelled',
              message: `"${bet.title}" was cancelled because no one took the other side. Your stake has been refunded.`,
              isRead: false,
              priority: 'MEDIUM',
              actionType: 'view_bet',
              actionData: { betId: bet.id },
              relatedBetId: bet.id,
            });

            console.log(`📧 Sent cancellation notification to bet creator ${bet.creatorId}`);
          } catch (notificationError) {
            console.warn(`Failed to send cancellation notification for bet ${bet.id}:`, notificationError);
          }

          cancelled++;
        }

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error updating bet ${bet.id}:`, error);
        errors++;
      }
    }

    console.log(`🎯 [Scheduled] Bet state update complete: ${updated} moved to pending, ${cancelled} cancelled, ${errors} errors`);
    return { updated, cancelled, errors, checkedCount: expiredActiveBets.length };

  } catch (error) {
    console.error('❌ Error in scheduled updateExpiredBets:', error);
    throw error;
  }
}