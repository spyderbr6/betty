import type { Handler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../data/resource.js';

// Configure Amplify for server-side usage
const endpoint = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;
const region = process.env.AWS_REGION;

if (!endpoint) {
  throw new Error('AMPLIFY_DATA_GRAPHQL_ENDPOINT environment variable is required');
}

Amplify.configure(
  {
    API: {
      GraphQL: {
        endpoint,
        region: region || 'us-east-1',
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
  console.log('🚀 Bet State Manager Lambda triggered:', JSON.stringify(event, null, 2));

  try {
    const result = await updateExpiredBets();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Bet state update completed',
        ...result
      })
    };
  } catch (error) {
    console.error('❌ Lambda execution failed:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Bet state update failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Check and update expired bets from ACTIVE to PENDING_RESOLUTION
 */
async function updateExpiredBets(): Promise<{ updated: number; cancelled: number; errors: number }> {
  let updated = 0;
  let cancelled = 0;
  let errors = 0;

  try {
    console.log('🕐 Checking for expired ACTIVE bets...');

    // Get all ACTIVE bets
    const { data: activeBets } = await client.models.Bet.list({
      filter: { status: { eq: 'ACTIVE' } }
    });

    if (!activeBets || activeBets.length === 0) {
      console.log('✅ No active bets found');
      return { updated: 0, cancelled: 0, errors: 0 };
    }

    const now = new Date();
    const expiredBets = activeBets.filter(bet => {
      if (!bet.deadline) return false;
      const deadline = new Date(bet.deadline);
      return deadline < now;
    });

    console.log(`📊 Found ${expiredBets.length} expired bets out of ${activeBets.length} active bets`);

    if (expiredBets.length === 0) {
      return { updated: 0, cancelled: 0, errors: 0 };
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

          console.log(`✅ Updated bet "${bet.title}" to PENDING_RESOLUTION`);
          updated++;
        } else {
          // Cancel bet if no participants joined
          await client.models.Bet.update({
            id: bet.id,
            status: 'CANCELLED',
            resolutionReason: 'No participants joined before deadline'
          });

          console.log(`❌ Cancelled bet "${bet.title}" - no participants`);
          cancelled++;
        }
      } catch (error) {
        console.error(`❌ Error updating bet ${bet.id}:`, error);
        errors++;
      }
    }

    console.log(`🎯 Bet state update complete: ${updated} moved to pending, ${cancelled} cancelled, ${errors} errors`);
    return { updated, cancelled, errors };

  } catch (error) {
    console.error('❌ Error in updateExpiredBets:', error);
    throw error;
  }
}