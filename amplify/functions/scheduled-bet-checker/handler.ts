import { EventBridgeHandler } from 'aws-lambda';
import { decideExpiry } from './expiryLogic';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/scheduled-bet-checker';
import { notificationMeta } from '../../shared/notificationCatalog';
import { isDuplicate, resolutionNeededNotificationId } from '../../shared/notificationIds';
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
      // A failed read must not look like "nothing expired": stakes would sit unrefunded
      if (page.errors?.length) throw new Error(`betsByStatus failed: ${JSON.stringify(page.errors)}`);
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
          await notifyResolutionNeeded(bet);

          updated++;
        } else {
          // Every stake is returned and the bet cancelled in one ledger transaction (the
          // money function); see cancelExpired.ts. This used to cancel and then refund by
          // reading and writing balances, so a concurrent write could be lost.
          const cancellation = await cancelExpiredBet(
            (entries, stateUpdates) => ledgerApply(client, entries, stateUpdates),
            bet.id,
            outcome.refunds,
            outcome.reason,
            bet.updatedAt
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
            await createNotification({
              userId: bet.creatorId!,
              type: 'BET_CANCELLED',
              ...notificationMeta('BET_CANCELLED'),
              title: 'Bet Cancelled',
              message: `"${bet.title}" was cancelled because no one took the other side. Your stake has been refunded.`,
              isRead: false,
              priority: 'MEDIUM',
              actionType: 'view_bet',
              actionData: JSON.stringify({ betId: bet.id }),
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

/**
 * Write a notification and say so when AppSync refuses it: the client reports a refused
 * write in `errors` rather than throwing (actionData as an object was refused this way).
 */
async function createNotification(input: Record<string, unknown>): Promise<void> {
  const { errors } = await client.models.Notification.create(input);
  if (errors?.length) throw new Error(`notification refused: ${JSON.stringify(errors)}`);
}

/**
 * Tell the creator their bet has closed and is waiting on them: nobody is paid until they
 * pick the winner. The id is fixed per bet, so two overlapping runs that both move the bet
 * write one notification (the second create is refused as a duplicate).
 */
async function notifyResolutionNeeded(bet: { id: string; creatorId: string; title?: string | null }): Promise<void> {
  try {
    const { errors } = await client.models.Notification.create({
      id: resolutionNeededNotificationId(bet.id),
      userId: bet.creatorId,
      type: 'BET_RESOLUTION_NEEDED',
      ...notificationMeta('BET_RESOLUTION_NEEDED'),
      title: 'Pick the Winner',
      message: `Betting on "${bet.title}" has closed. Pick the winner so everyone gets paid.`,
      isRead: false,
      priority: 'HIGH',
      actionType: 'resolve_bet',
      actionData: JSON.stringify({ betId: bet.id }),
      relatedBetId: bet.id,
    });
    if (errors?.length && !isDuplicate(errors)) {
      console.warn(`Failed to send resolution notification for bet ${bet.id}:`, JSON.stringify(errors));
    }
  } catch (error) {
    console.warn(`Failed to send resolution notification for bet ${bet.id}:`, error);
  }
}