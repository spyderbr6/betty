import { EventBridgeHandler } from 'aws-lambda';
import { isReadyForPayout, payoutSkipReason } from './payoutLogic';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/payout-processor';
import { settleBet } from '../../shared/moneyClient';

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
 * Find bets whose dispute window has passed and settle each one.
 *
 * Settlement itself is the money function's settleBet (docs/SECURITY_PLAN.md): it
 * computes every payout from the stakes on the server, checks for open and upheld
 * disputes, and credits through the atomic ledger. This function used to credit whatever
 * amounts the pending transactions held - rows the creator's phone wrote, and which any
 * signed-in user could create - after finding them with a filtered Scan that read one
 * page of the table, then marking the bet resolved whether or not every payout was found.
 */
async function processCompletedDisputeWindows(): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const now = new Date();

  // Every page: one page of a busy status could leave bets waiting forever
  const pendingBets: any[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.Bet.betsByStatus({ status: 'PENDING_RESOLUTION' }, { nextToken });
    pendingBets.push(...(page.data ?? []));
    nextToken = page.nextToken;
  } while (nextToken);

  if (pendingBets.length === 0) {
    console.log('✅ [Payout] No bets pending resolution');
    return { processed, skipped, errors };
  }
  console.log(`📊 [Payout] Found ${pendingBets.length} bets pending resolution`);

  for (const bet of pendingBets) {
    if (!bet.id || !bet.creatorId) continue;

    try {
      const { data: participants } = await client.models.Participant.participantsByBet({ betId: bet.id });
      const candidate = {
        winningSide: bet.winningSide,
        disputeWindowEndsAt: bet.disputeWindowEndsAt,
        hasNonCreatorParticipants: (participants ?? []).some((p: any) => p.userId !== bet.creatorId),
      };
      if (!isReadyForPayout(candidate, now)) {
        console.log(`⏭️ [Payout] Skipping bet ${bet.id}: ${payoutSkipReason(candidate, now)}`);
        skipped++;
        continue;
      }

      const result = await settleBet(client, bet.id);
      if (result.status !== 'settled') {
        console.log(`⏭️ [Payout] Bet ${bet.id} not settled: ${result.reason}`);
        skipped++;
        continue;
      }

      console.log(`✅ [Payout] Settled bet ${bet.id}: ${result.paid} paid, ${result.refunded} refunded`);
      processed++;
      await rewardCreator(bet);
    } catch (error) {
      // settleBet is idempotent: the next run picks up where this one stopped
      console.error(`❌ [Payout] Error settling bet ${bet.id}:`, error);
      errors++;
    }
  }

  return { processed, skipped, errors };
}

/** Trust score reward for a clean resolution (+0.2), then any milestone. */
async function rewardCreator(bet: { id: string; title?: string | null; creatorId: string }): Promise<void> {
  try {
    const { data: creator } = await client.models.User.get({ id: bet.creatorId });
    if (!creator) return;
    const currentScore = creator.trustScore || 5.0;
    const change = 0.2;
    const newTrustScore = Math.max(0, Math.min(10, currentScore + change));

    await client.models.User.update({ id: bet.creatorId, trustScore: newTrustScore });
    await client.models.TrustScoreHistory.create({
      userId: bet.creatorId,
      change,
      newScore: newTrustScore,
      reason: `Bet "${bet.title}" resolved fairly without disputes`,
      relatedBetId: bet.id,
      createdAt: new Date().toISOString(),
    });
    console.log(`⭐ Trust score reward applied to creator ${bet.creatorId}: ${currentScore.toFixed(2)} → ${newTrustScore.toFixed(2)} (+${change})`);

    await checkAndApplyMilestones(bet.creatorId);
  } catch (trustError) {
    console.warn(`Failed to update trust score for creator ${bet.creatorId}:`, trustError);
  }
}

/**
 * Check and apply milestone rewards for clean bet resolutions
 * Milestones: 10 bets (+0.5), 25 bets (+1.0), 50 bets (+1.5)
 */
async function checkAndApplyMilestones(userId: string): Promise<void> {
  try {
    // Get resolved bets using GSI, then filter by creator
    const { data: resolvedBets } = await client.models.Bet.betsByStatus({
      status: 'RESOLVED'
    });
    const creatorResolvedBets = resolvedBets?.filter((b: any) => b.creatorId === userId) || [];

    const resolvedCount = creatorResolvedBets.length;

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
