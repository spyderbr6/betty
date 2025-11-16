/**
 * Bet Acceptance Service
 * Handles participant acceptance of bet results for early closure
 * When all participants accept, bet closes immediately without waiting 48 hours
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationService } from './notificationService';

const client = generateClient<Schema>();

export class BetAcceptanceService {
  /**
   * Accept the result of a bet (non-creator participants only)
   * Note: Creator cannot accept - their resolution IS their implicit acceptance
   * @param betId - ID of the bet
   * @param userId - ID of the participant accepting (must not be creator)
   * @returns true if acceptance was recorded successfully
   */
  static async acceptBetResult(betId: string, userId: string): Promise<boolean> {
    try {
      console.log(`[BetAcceptance] User ${userId} accepting result for bet ${betId}`);

      // Get the bet
      const { data: bet } = await client.models.Bet.get({ id: betId });
      if (!bet) {
        console.error('[BetAcceptance] Bet not found');
        return false;
      }

      // Verify user is NOT the creator (creator's resolution IS their acceptance)
      if (bet.creatorId === userId) {
        console.error('[BetAcceptance] Creator cannot accept - their resolution is implicit acceptance');
        return false;
      }

      // Verify bet is in PENDING_RESOLUTION status
      if (bet.status !== 'PENDING_RESOLUTION') {
        console.error('[BetAcceptance] Bet is not pending resolution, cannot accept');
        return false;
      }

      // Verify bet has been resolved (has a winning side)
      if (!bet.winningSide) {
        console.error('[BetAcceptance] Bet has not been resolved yet');
        return false;
      }

      // Get the participant record
      const { data: participants } = await client.models.Participant.list({
        filter: {
          and: [
            { betId: { eq: betId } },
            { userId: { eq: userId } }
          ]
        }
      });

      if (!participants || participants.length === 0) {
        console.error('[BetAcceptance] User is not a participant in this bet');
        return false;
      }

      const participant = participants[0];

      // Check if already accepted
      if (participant.hasAcceptedResult) {
        console.log('[BetAcceptance] User has already accepted this result');
        return true; // Not an error, just already done
      }

      // Update participant to mark as accepted
      const { data: updatedParticipant, errors } = await client.models.Participant.update({
        id: participant.id!,
        hasAcceptedResult: true,
        acceptedResultAt: new Date().toISOString()
      });

      if (errors || !updatedParticipant) {
        console.error('[BetAcceptance] Error updating participant:', errors);
        return false;
      }

      console.log(`[BetAcceptance] User ${userId} accepted result for bet ${betId}`);

      // Check if all participants have now accepted
      const allAccepted = await this.checkIfAllAccepted(betId);
      if (allAccepted) {
        console.log(`[BetAcceptance] All participants accepted! Triggering early closure for bet ${betId}`);
        await this.triggerEarlyClosure(betId);
      } else {
        // Get acceptance progress for notification
        const progress = await this.getAcceptanceProgress(betId);
        console.log(`[BetAcceptance] Acceptance progress: ${progress.acceptedCount}/${progress.totalCount}`);

        // Notify bet creator of acceptance progress
        if (bet.creatorId) {
          await NotificationService.createNotification({
            userId: bet.creatorId,
            type: 'BET_RESOLVED',
            title: 'Bet Result Accepted',
            message: `${progress.acceptedCount} of ${progress.totalCount} participants have accepted the result for "${bet.title}"`,
            priority: 'MEDIUM',
            actionType: 'view_bet',
            actionData: { betId },
            relatedBetId: betId,
            relatedUserId: userId
          });
        }
      }

      return true;

    } catch (error) {
      console.error('[BetAcceptance] Error accepting bet result:', error);
      return false;
    }
  }

  /**
   * Check if all participants have accepted the bet result
   * Note: Creator is excluded - their resolution IS their acceptance
   * @param betId - ID of the bet
   * @returns true if all non-creator participants have accepted
   */
  static async checkIfAllAccepted(betId: string): Promise<boolean> {
    try {
      // Get bet to know who the creator is
      const { data: bet } = await client.models.Bet.get({ id: betId });
      if (!bet) {
        console.error('[BetAcceptance] Bet not found');
        return false;
      }

      // Get all participants for this bet
      const { data: participants } = await client.models.Participant.list({
        filter: { betId: { eq: betId } }
      });

      if (!participants || participants.length === 0) {
        console.log('[BetAcceptance] No participants found for bet');
        return false;
      }

      // Filter out creator - they don't need to accept (their resolution IS their acceptance)
      const nonCreatorParticipants = participants.filter((p: any) => p.userId !== bet.creatorId);

      if (nonCreatorParticipants.length === 0) {
        console.log('[BetAcceptance] No non-creator participants found');
        return false;
      }

      // Check if all non-creator participants have accepted
      const allAccepted = nonCreatorParticipants.every((p: any) => p.hasAcceptedResult === true);

      console.log(`[BetAcceptance] Bet ${betId}: ${nonCreatorParticipants.filter((p: any) => p.hasAcceptedResult).length}/${nonCreatorParticipants.length} non-creator participants accepted`);

      return allAccepted;

    } catch (error) {
      console.error('[BetAcceptance] Error checking if all accepted:', error);
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

      const { data: participants } = await client.models.Participant.list({
        filter: { betId: { eq: betId } }
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
   * Trigger early closure by setting disputeWindowEndsAt to now
   * The scheduled payout-processor Lambda will pick it up on the next run
   * @param betId - ID of the bet
   */
  private static async triggerEarlyClosure(betId: string): Promise<void> {
    try {
      console.log(`[BetAcceptance] Triggering early closure for bet ${betId}`);

      // Get the bet details for notification
      const { data: bet } = await client.models.Bet.get({ id: betId });
      if (!bet) {
        console.error('[BetAcceptance] Bet not found');
        return;
      }

      // Set disputeWindowEndsAt to NOW (or slightly in the past to ensure immediate processing)
      const now = new Date();
      now.setMinutes(now.getMinutes() - 1); // Set to 1 minute ago to ensure Lambda picks it up

      const { data: updatedBet, errors } = await client.models.Bet.update({
        id: betId,
        disputeWindowEndsAt: now.toISOString()
      });

      if (errors || !updatedBet) {
        console.error('[BetAcceptance] Error updating dispute window:', errors);
        return;
      }

      console.log(`[BetAcceptance] Dispute window updated to ${now.toISOString()}`);
      console.log('[BetAcceptance] Payout will be processed within 5 minutes by scheduled Lambda');

      // Notify all participants that bet will close early
      const { data: participants } = await client.models.Participant.list({
        filter: { betId: { eq: betId } }
      });

      if (participants) {
        for (const participant of participants) {
          if (!participant.userId) continue;

          const isWinner = participant.side === bet.winningSide;

          await NotificationService.createNotification({
            userId: participant.userId,
            type: 'BET_RESOLVED',
            title: 'Bet Closing Early!',
            message: isWinner
              ? `All participants accepted the result! You'll receive $${participant.payout?.toFixed(2)} within 5 minutes.`
              : `All participants accepted the result. Better luck next time!`,
            priority: 'HIGH',
            actionType: 'view_bet',
            actionData: { betId },
            relatedBetId: betId
          });
        }
      }

      // Notify creator
      if (bet.creatorId) {
        await NotificationService.createNotification({
          userId: bet.creatorId,
          type: 'BET_RESOLVED',
          title: 'Bet Accepted by All!',
          message: `All participants accepted the result for "${bet.title}". Bet will close within 5 minutes.`,
          priority: 'HIGH',
          actionType: 'view_bet',
          actionData: { betId },
          relatedBetId: betId
        });
      }

    } catch (error) {
      console.error('[BetAcceptance] Error triggering early closure:', error);
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
