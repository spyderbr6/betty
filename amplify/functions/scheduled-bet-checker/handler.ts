import { EventBridgeHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/scheduled-bet-checker';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

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

    // Get only ACTIVE bets that have expired (deadline < now) in a single optimized query
    const { data: expiredActiveBets } = await client.models.Bet.list({
      filter: {
        and: [
          { status: { eq: 'ACTIVE' } },
          { deadline: { lt: currentISOString } }
        ]
      }
    });

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

        // Check if bet has participants
        const { data: participants } = await client.models.Participant.list({
          filter: { betId: { eq: bet.id } }
        });

        const hasParticipants = participants && participants.length > 0;

        if (hasParticipants) {
          // Update to PENDING_RESOLUTION if there are participants
          await client.models.Bet.update({
            id: bet.id,
            status: 'PENDING_RESOLUTION'
          });

          updated++;
        } else {
          // Cancel bet if no participants joined
          await client.models.Bet.update({
            id: bet.id,
            status: 'CANCELLED',
            resolutionReason: 'No participants joined before deadline'
          });

          // Notify bet creator that their bet was cancelled
          try {
            await client.models.Notification.create({
              userId: bet.creatorId!,
              type: 'BET_CANCELLED',
              title: 'Bet Cancelled',
              message: `"${bet.title}" was cancelled because no one joined before the deadline`,
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