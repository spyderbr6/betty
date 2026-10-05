/**
 * Bet Acceptance Service
 * Handles participant acceptance of bet results for early closure
 * When all participants accept, bet closes immediately without waiting 48 hours
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export class BetAcceptanceService {
  /**
   * Accept the result of a bet (non-creator participants only). The creator's resolution
   * is their acceptance.
   *
   * The server's acceptBetResult mutation checks the caller is a participant, records the
   * acceptance and, when everyone but the creator has accepted, closes the dispute window
   * early in the same write, and sends the notifications. This phone used to count the
   * acceptances itself and set the bet's disputeWindowEndsAt to the past, a field that
   * decides when money moves.
   * @returns true if the acceptance was recorded
   */
  static async acceptBetResult(betId: string): Promise<boolean> {
    try {
      const { data, errors } = await client.mutations.acceptBetResult({ betId });
      if (errors?.length) {
        console.error('[BetAcceptance] acceptBetResult failed:', errors);
        return false;
      }
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (result?.status !== 'accepted') {
        console.warn('[BetAcceptance] Acceptance refused:', result);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[BetAcceptance] Error accepting bet result:', error);
      return false;
    }
  }

  /**
   * Get acceptance progress for a bet
   * Note: Creator is excluded from count - their resolution IS their acceptance
   * @param betId - ID of the bet
   * @returns Object with total non-creator participants and how many have accepted
   */
  static async getAcceptanceProgress(betId: string): Promise<{
    totalCount: number;
    acceptedCount: number;
    acceptedUserIds: string[];
  }> {
    try {
      // Get bet to know who the creator is
      const { data: bet } = await client.models.Bet.get({ id: betId });
      if (!bet) {
        console.error('[BetAcceptance] Bet not found');
        return { totalCount: 0, acceptedCount: 0, acceptedUserIds: [] };
      }

      const { data: participants } = await client.models.Participant.participantsByBet({
        betId: betId
      });

      if (!participants) {
        return { totalCount: 0, acceptedCount: 0, acceptedUserIds: [] };
      }

      // Filter out creator - they don't need to accept
      const nonCreatorParticipants = participants.filter((p: any) => p.userId !== bet.creatorId);

      const acceptedUserIds = nonCreatorParticipants
        .filter((p: any) => p.hasAcceptedResult === true)
        .map((p: any) => p.userId!)
        .filter((id: any) => id !== undefined);

      return {
        totalCount: nonCreatorParticipants.length,
        acceptedCount: acceptedUserIds.length,
        acceptedUserIds
      };

    } catch (error) {
      console.error('[BetAcceptance] Error getting acceptance progress:', error);
      return { totalCount: 0, acceptedCount: 0, acceptedUserIds: [] };
    }
  }

  /**
   * Check if a user has accepted the result for a bet
   * @param betId - ID of the bet
   * @param userId - ID of the user
   * @returns true if user has accepted
   */
  static async hasUserAccepted(betId: string, userId: string): Promise<boolean> {
    try {
      const { data: participants } = await client.models.Participant.list({
        filter: {
          and: [
            { betId: { eq: betId } },
            { userId: { eq: userId } }
          ]
        }
      });

      if (!participants || participants.length === 0) {
        return false;
      }

      return participants[0].hasAcceptedResult === true;

    } catch (error) {
      console.error('[BetAcceptance] Error checking if user accepted:', error);
      return false;
    }
  }
}
