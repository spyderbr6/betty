import type { Handler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../data/resource.js';

// Configure Amplify for server-side usage
Amplify.configure(
  {
    API: {
      GraphQL: {
        endpoint: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
        region: process.env.AWS_REGION || 'us-east-1',
        defaultAuthMode: 'iam'
      }
    }
  },
  {
    ssr: true
  }
);

const client = generateClient<Schema>({
  authMode: 'iam'
});

export const handler: Handler = async (event) => {
  console.log('⏰ Scheduled bet checker triggered:', JSON.stringify(event, null, 2));

  try {
    const result = await updateExpiredBets();

    console.log(`✅ Scheduled bet check completed: ${JSON.stringify(result)}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled bet state update completed',
        timestamp: new Date().toISOString(),
        ...result
      })
    };
  } catch (error) {
    console.error('❌ Scheduled bet check failed:', error);

    // Don't throw - we want the schedule to continue running
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Scheduled bet state update failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Check and update expired bets from ACTIVE to PENDING_RESOLUTION
 */
async function updateExpiredBets(): Promise<{ updated: number; cancelled: number; errors: number; checkedCount: number }> {
  let updated = 0;
  let cancelled = 0;
  let errors = 0;

  try {
    console.log('🕐 [Scheduled] Checking for expired ACTIVE bets...');

    // Get all ACTIVE bets
    const { data: activeBets } = await client.models.Bet.list({
      filter: { status: { eq: 'ACTIVE' } }
    });

    if (!activeBets || activeBets.length === 0) {
      console.log('✅ [Scheduled] No active bets found');
      return { updated: 0, cancelled: 0, errors: 0, checkedCount: 0 };
    }

    console.log(`📊 [Scheduled] Checking ${activeBets.length} active bets for expiration`);

    const now = new Date();
    const expiredBets = activeBets.filter(bet => {
      if (!bet.deadline) {
        console.warn(`⚠️ Bet ${bet.id} has no deadline, skipping`);
        return false;
      }
      const deadline = new Date(bet.deadline);
      const isExpired = deadline < now;

      if (isExpired) {
        const minutesAgo = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60));
        console.log(`🕐 Bet "${bet.title}" expired ${minutesAgo} minutes ago`);
      }

      return isExpired;
    });

    console.log(`📊 [Scheduled] Found ${expiredBets.length} expired bets out of ${activeBets.length} active bets`);

    if (expiredBets.length === 0) {
      return { updated: 0, cancelled: 0, errors: 0, checkedCount: activeBets.length };
    }

    // Process each expired bet
    for (const bet of expiredBets) {
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

          console.log(`✅ [Scheduled] Updated bet "${bet.title}" to PENDING_RESOLUTION (${participants.length} participants)`);
          updated++;
        } else {
          // Cancel bet if no participants joined
          await client.models.Bet.update({
            id: bet.id,
            status: 'CANCELLED',
            resolutionReason: 'No participants joined before deadline'
          });

          console.log(`❌ [Scheduled] Cancelled bet "${bet.title}" - no participants joined`);
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
    return { updated, cancelled, errors, checkedCount: activeBets.length };

  } catch (error) {
    console.error('❌ Error in scheduled updateExpiredBets:', error);
    throw error;
  }
}