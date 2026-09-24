import { EventBridgeHandler } from 'aws-lambda';
import { decideExpiry } from './expiryLogic';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/scheduled-bet-checker';

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

    // Get ACTIVE bets using GSI (scan filter only returns first page!), then filter by deadline
    const { data: activeBets } = await client.models.Bet.betsByStatus({
      status: 'ACTIVE'
    });
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
          await client.models.Bet.update({
            id: bet.id,
            status: 'CANCELLED',
            resolutionReason: outcome.reason
          });

          // Return every stake. The old cancellation path set the status and
          // notified, and refunded nobody - which was survivable only because it
          // was unreachable. It is reachable now.
          for (const refund of outcome.refunds) {
            try {
              const { data: participantUser } = await client.models.User.get({ id: refund.userId });
              const balanceBefore = participantUser?.balance || 0;
              const balanceAfter = balanceBefore + refund.amount;

              // Same shape as the squares refund in scheduled-squares-checker,
              // which is the existing precedent for returning a stake.
              const refundedAt = new Date().toISOString();
              await client.models.Transaction.create({
                userId: refund.userId,
                type: 'BET_CANCELLED',
                status: 'COMPLETED',
                amount: refund.amount,
                platformFee: 0,
                balanceBefore,
                balanceAfter,
                relatedBetId: bet.id,
                relatedParticipantId: refund.participantId,
                notes: `Refund: ${outcome.reason}`,
                createdAt: refundedAt,
                completedAt: refundedAt,
              });

              await client.models.User.update({ id: refund.userId, balance: balanceAfter });
              console.log(`💸 Refunded $${refund.amount} to ${refund.userId} for bet ${bet.id}`);
            } catch (refundError) {
              // Keep going: one failed refund must not strand the others, and the
              // bet is already CANCELLED so it will not be paid out twice.
              console.error(`❌ Failed to refund ${refund.userId} for bet ${bet.id}:`, refundError);
              errors++;
            }
          }

          // Notify bet creator that their bet was cancelled
          try {
            await client.models.Notification.create({
              userId: bet.creatorId!,
              type: 'BET_CANCELLED',
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