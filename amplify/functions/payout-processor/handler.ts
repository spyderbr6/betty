import { EventBridgeHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/payout-processor';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

export const handler: EventBridgeHandler<"Scheduled Event", null, boolean> = async (event) => {
  console.log('💰 Payout processor triggered:', JSON.stringify(event, null, 2));

  try {
    const result = await processCompletedDisputeWindows();

    console.log(`✅ Payout processing completed: ${JSON.stringify(result)}`);
    return true;

  } catch (error) {
    console.error('❌ Payout processing failed:', error);
    return false;
  }
};

/**
 * Process bets where the 48-hour dispute window has expired
 * - Complete pending transactions
 * - Update bet status to RESOLVED
 * - Apply trust score rewards for clean resolutions
 */
async function processCompletedDisputeWindows(): Promise<{
  processed: number;
  errors: number;
  totalPayouts: number;
}> {
  let processed = 0;
  let errors = 0;
  let totalPayouts = 0;

  try {
    console.log('🕐 [Payout] Checking for bets ready for payout...');

    const now = new Date();
    const currentISOString = now.toISOString();

    // Get all PENDING_RESOLUTION bets (we'll filter them below)
    const { data: pendingBets } = await client.models.Bet.list({
      filter: {
        status: { eq: 'PENDING_RESOLUTION' }
      }
    });

    if (!pendingBets || pendingBets.length === 0) {
      console.log('✅ [Payout] No bets pending resolution');
      return { processed: 0, errors: 0, totalPayouts: 0 };
    }

    console.log(`📊 [Payout] Found ${pendingBets.length} bets pending resolution`);

    // Filter to find bets ready for payout
    const betsReadyForPayout = [];
    for (const bet of pendingBets) {
      if (!bet.id || !bet.creatorId) continue;

      // Check if dispute window has expired
      const disputeWindowExpired = bet.disputeWindowEndsAt && new Date(bet.disputeWindowEndsAt) < now;

      // Check if there are any non-creator participants
      const { data: participants } = await client.models.Participant.list({
        filter: { betId: { eq: bet.id } }
      });

      const nonCreatorParticipants = participants?.filter((p: any) => p.userId !== bet.creatorId) || [];
      const hasNonCreatorParticipants = nonCreatorParticipants.length > 0;

      // Process if:
      // 1. Dispute window expired, OR
      // 2. No non-creator participants (creator-only bet - no one to dispute)
      if (disputeWindowExpired || !hasNonCreatorParticipants) {
        if (!hasNonCreatorParticipants) {
          console.log(`🎯 [Payout] Bet ${bet.id} has no non-creator participants - processing immediately`);
        }
        betsReadyForPayout.push(bet);
      }
    }

    if (betsReadyForPayout.length === 0) {
      console.log('✅ [Payout] No bets ready for payout yet');
      return { processed: 0, errors: 0, totalPayouts: 0 };
    }

    console.log(`💰 [Payout] Processing ${betsReadyForPayout.length} bet(s) ready for payout`);

    // Process each bet
    for (const bet of betsReadyForPayout) {
      try {
        if (!bet.id) {
          console.error('❌ Bet missing ID, skipping');
          errors++;
          continue;
        }

        console.log(`💰 Processing payout for bet "${bet.title}" (${bet.id})`);

        // Check if there are any pending disputes for this bet
        const { data: disputes } = await client.models.Dispute.list({
          filter: {
            and: [
              { betId: { eq: bet.id } },
              { status: { eq: 'PENDING' } }
            ]
          }
        });

        if (disputes && disputes.length > 0) {
          console.log(`⚠️ Bet ${bet.id} has ${disputes.length} pending dispute(s), skipping payout`);
          // Don't process - dispute needs to be resolved first
          continue;
        }

        // Get all pending transactions for this bet
        const { data: pendingTransactions } = await client.models.Transaction.list({
          filter: {
            and: [
              { relatedBetId: { eq: bet.id } },
              { status: { eq: 'PENDING' } }
            ]
          }
        });

        if (!pendingTransactions || pendingTransactions.length === 0) {
          console.log(`⚠️ No pending transactions found for bet ${bet.id}`);
          // Update bet to RESOLVED anyway (edge case: bet with no winners?)
          await client.models.Bet.update({
            id: bet.id,
            status: 'RESOLVED'
          });
          processed++;
          continue;
        }

        console.log(`💵 Completing ${pendingTransactions.length} pending payout(s) for bet ${bet.id}`);

        // Complete each pending transaction and update user balance
        for (const transaction of pendingTransactions) {
          try {
            if (!transaction.id || !transaction.userId) {
              console.error('❌ Transaction missing ID or userId, skipping');
              continue;
            }

            // Get user's current balance BEFORE crediting
            const { data: user } = await client.models.User.get({ id: transaction.userId });
            if (!user) {
              console.error(`❌ User ${transaction.userId} not found, skipping transaction`);
              continue;
            }

            const currentBalance = user.balance || 0;

            // Calculate platform fee for BET_WON transactions (3%)
            let platformFee = 0;
            let netAmount = transaction.amount || 0;

            if (transaction.type === 'BET_WON') {
              platformFee = Math.round((transaction.amount || 0) * 0.03 * 100) / 100;
              netAmount = (transaction.amount || 0) - platformFee;
              console.log(`💰 Applying 3% platform fee: Gross: $${transaction.amount}, Fee: $${platformFee}, Net: $${netAmount}`);
            }

            // Use actualAmount if available (net after platform fee), otherwise calculate from amount
            const amountToCredit = transaction.actualAmount !== undefined && transaction.actualAmount !== null
              ? transaction.actualAmount
              : netAmount;
            const newBalance = currentBalance + amountToCredit;

            // Update transaction status to COMPLETED with correct balance fields
            await client.models.Transaction.update({
              id: transaction.id,
              status: 'COMPLETED',
              platformFee: platformFee,
              balanceBefore: currentBalance,
              balanceAfter: newBalance,
              completedAt: new Date().toISOString()
            });

            // Update user balance with NET amount (after fee)
            await client.models.User.update({
              id: transaction.userId,
              balance: newBalance
            });

            console.log(`✅ User ${transaction.userId} balance updated: ${currentBalance} → ${newBalance} (credited: $${amountToCredit})`);
            totalPayouts++;

            // Send notification to winner with NET amount
            try {
              const netAmount = transaction.actualAmount || transaction.amount || 0;
              const platformFee = transaction.platformFee || 0;
              const message = platformFee > 0
                ? `You won $${netAmount.toFixed(2)} on "${bet.title}" (platform fee: $${platformFee.toFixed(2)})`
                : `You won $${netAmount.toFixed(2)} on "${bet.title}"`;

              await client.models.Notification.create({
                userId: transaction.userId,
                type: 'BET_RESOLVED',
                title: 'Bet Won!',
                message: message,
                isRead: false,
                priority: 'HIGH',
                actionType: 'view_bet',
                actionData: { betId: bet.id },
                relatedBetId: bet.id,
              });
            } catch (notificationError) {
              console.warn(`Failed to send payout notification:`, notificationError);
            }

          } catch (txError) {
            console.error(`❌ Error completing transaction ${transaction.id}:`, txError);
            errors++;
          }
        }

        // Update bet status to RESOLVED
        await client.models.Bet.update({
          id: bet.id,
          status: 'RESOLVED'
        });

        // Apply trust score reward for clean resolution (+0.2)
        if (bet.creatorId) {
          try {
            const { data: creator } = await client.models.User.get({ id: bet.creatorId });
            if (creator) {
              const currentScore = creator.trustScore || 5.0;
              const change = 0.2;
              const newTrustScore = Math.max(0, Math.min(10, currentScore + change));

              await client.models.User.update({
                id: bet.creatorId,
                trustScore: newTrustScore
              });

              // Record trust score change
              await client.models.TrustScoreHistory.create({
                userId: bet.creatorId,
                change: change,
                newScore: newTrustScore,
                reason: `Bet "${bet.title}" resolved fairly without disputes`,
                relatedBetId: bet.id,
                createdAt: new Date().toISOString()
              });

              console.log(`⭐ Trust score reward applied to creator ${bet.creatorId}: ${currentScore.toFixed(2)} → ${newTrustScore.toFixed(2)} (+${change})`);

              // Check for milestone rewards
              await checkAndApplyMilestones(bet.creatorId);
            }
          } catch (trustError) {
            console.warn(`Failed to update trust score for creator ${bet.creatorId}:`, trustError);
          }
        }

        processed++;
        console.log(`✅ Payout completed for bet ${bet.id}`);

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error processing payout for bet ${bet.id}:`, error);
        errors++;
      }
    }

    console.log(`🎯 [Payout] Processing complete: ${processed} bets, ${totalPayouts} payouts, ${errors} errors`);
    return { processed, errors, totalPayouts };

  } catch (error) {
    console.error('❌ Error in processCompletedDisputeWindows:', error);
    throw error;
  }
}

/**
 * Check and apply milestone rewards for clean bet resolutions
 * Milestones: 10 bets (+0.5), 25 bets (+1.0), 50 bets (+1.5)
 */
async function checkAndApplyMilestones(userId: string): Promise<void> {
  try {
    // Get count of resolved bets created by this user
    const { data: resolvedBets } = await client.models.Bet.list({
      filter: {
        and: [
          { creatorId: { eq: userId } },
          { status: { eq: 'RESOLVED' } }
        ]
      }
    });

    const resolvedCount = resolvedBets?.length || 0;

    // Check if user just hit a milestone (exact count)
    let milestoneReward = 0;
    let milestoneName = '';

    if (resolvedCount === 10) {
      milestoneReward = 0.5;
      milestoneName = '10 bets resolved fairly';
    } else if (resolvedCount === 25) {
      milestoneReward = 1.0;
      milestoneName = '25 bets resolved fairly';
    } else if (resolvedCount === 50) {
      milestoneReward = 1.5;
      milestoneName = '50 bets resolved fairly - super user status!';
    }

    // If milestone reached, apply reward
    if (milestoneReward > 0) {
      const { data: user } = await client.models.User.get({ id: userId });
      if (user) {
        const currentScore = user.trustScore || 5.0;
        const newTrustScore = Math.max(0, Math.min(10, currentScore + milestoneReward));

        await client.models.User.update({
          id: userId,
          trustScore: newTrustScore
        });

        await client.models.TrustScoreHistory.create({
          userId: userId,
          change: milestoneReward,
          newScore: newTrustScore,
          reason: `Milestone: ${milestoneName}`,
          createdAt: new Date().toISOString()
        });

        console.log(`🎯 Milestone reward applied to user ${userId}: ${milestoneName} (+${milestoneReward})`);
      }
    }
  } catch (error) {
    console.warn(`Failed to check milestones for user ${userId}:`, error);
  }
}
