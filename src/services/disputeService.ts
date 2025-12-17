/**
 * Dispute Service
 * Centralized service for managing bet disputes
 * Handles dispute filing, validation, and resolution
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationService } from './notificationService';
import { TrustScoreService } from './trustScoreService';

const client = generateClient<Schema>();

export type DisputeReason =
  | 'INCORRECT_RESOLUTION'
  | 'NO_RESOLUTION'
  | 'EVIDENCE_IGNORED'
  | 'OTHER';

export type DisputeStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'RESOLVED_FOR_FILER'
  | 'RESOLVED_FOR_CREATOR'
  | 'DISMISSED';

export interface Dispute {
  id: string;
  betId: string;
  filedBy: string;
  againstUserId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  evidenceUrls?: string[];
  adminNotes?: string;
  resolvedBy?: string;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface FileDisputeParams {
  betId: string;
  filedBy: string;
  againstUserId: string;
  reason: DisputeReason;
  description: string;
  evidenceUrls?: string[];
}

export class DisputeService {
  // Dispute filing restrictions
  private static readonly DISPUTE_COOLDOWN_HOURS = 24;
  private static readonly MAX_PENDING_DISPUTES = 3;
  private static readonly DISPUTE_WINDOW_DAYS = 7;

  /**
   * Check if user can file a dispute
   * Enforces cooldown and pending dispute limits
   */
  static async canFileDispute(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // Check for disputes filed in last 24 hours
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - this.DISPUTE_COOLDOWN_HOURS);

      const { data: recentDisputes } = await client.models.Dispute.list({
        filter: {
          and: [
            { filedBy: { eq: userId } },
            { createdAt: { gt: twentyFourHoursAgo.toISOString() } }
          ]
        }
      });

      if (recentDisputes && recentDisputes.length > 0) {
        return {
          allowed: false,
          reason: `You can only file one dispute every ${this.DISPUTE_COOLDOWN_HOURS} hours. Please try again later.`
        };
      }

      // Check for pending disputes
      const { data: pendingDisputes } = await client.models.Dispute.list({
        filter: {
          and: [
            { filedBy: { eq: userId } },
            { status: { eq: 'PENDING' } }
          ]
        }
      });

      if (pendingDisputes && pendingDisputes.length >= this.MAX_PENDING_DISPUTES) {
        return {
          allowed: false,
          reason: `You have ${pendingDisputes.length} pending disputes. Maximum allowed is ${this.MAX_PENDING_DISPUTES}.`
        };
      }

      return { allowed: true };

    } catch (error) {
      console.error('[Dispute] Error checking dispute eligibility:', error);
      return { allowed: false, reason: 'An error occurred. Please try again.' };
    }
  }

  /**
   * Check if a bet can be disputed
   * Must be RESOLVED or PENDING_RESOLUTION and within dispute window
   */
  static async canDisputeBet(betId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const { data: bet } = await client.models.Bet.get({ id: betId });

      if (!bet) {
        return { allowed: false, reason: 'Bet not found' };
      }

      // Check bet status
      if (bet.status !== 'RESOLVED' && bet.status !== 'PENDING_RESOLUTION') {
        return { allowed: false, reason: 'Only resolved bets can be disputed' };
      }

      // Check if bet was resolved (has a winningSide)
      if (!bet.winningSide) {
        return { allowed: false, reason: 'Bet has not been resolved yet' };
      }

      // Check dispute window (7 days from resolution)
      if (bet.updatedAt) {
        const resolutionDate = new Date(bet.updatedAt);
        const disputeWindowEnds = new Date(resolutionDate);
        disputeWindowEnds.setDate(disputeWindowEnds.getDate() + this.DISPUTE_WINDOW_DAYS);

        if (new Date() > disputeWindowEnds) {
          return { allowed: false, reason: `Dispute window expired. You had ${this.DISPUTE_WINDOW_DAYS} days to file.` };
        }
      }

      // Check if dispute already exists for this bet
      const { data: existingDisputes } = await client.models.Dispute.list({
        filter: {
          and: [
            { betId: { eq: betId } },
            { status: { eq: 'PENDING' } }
          ]
        }
      });

      if (existingDisputes && existingDisputes.length > 0) {
        return { allowed: false, reason: 'A dispute is already pending for this bet' };
      }

      return { allowed: true };

    } catch (error) {
      console.error('[Dispute] Error checking bet eligibility:', error);
      return { allowed: false, reason: 'An error occurred. Please try again.' };
    }
  }

  /**
   * File a new dispute
   */
  static async fileDispute(params: FileDisputeParams): Promise<Dispute | null> {
    try {
      console.log('[Dispute] Filing dispute:', params);

      // Check if user can file dispute
      const userCheck = await this.canFileDispute(params.filedBy);
      if (!userCheck.allowed) {
        throw new Error(userCheck.reason);
      }

      // Check if bet can be disputed
      const betCheck = await this.canDisputeBet(params.betId);
      if (!betCheck.allowed) {
        throw new Error(betCheck.reason);
      }

      // Create dispute
      const { data: dispute, errors } = await client.models.Dispute.create({
        betId: params.betId,
        filedBy: params.filedBy,
        againstUserId: params.againstUserId,
        reason: params.reason,
        description: params.description,
        status: 'PENDING',
        evidenceUrls: params.evidenceUrls || [],
        createdAt: new Date().toISOString()
      });

      if (errors || !dispute) {
        console.error('[Dispute] Error creating dispute:', errors);
        return null;
      }

      // Update bet status to DISPUTED
      await client.models.Bet.update({
        id: params.betId,
        status: 'DISPUTED'
      });

      // Send notification to bet creator
      await NotificationService.createNotification({
        userId: params.againstUserId,
        type: 'BET_DISPUTED',
        title: 'Bet Disputed',
        message: `A participant has filed a dispute on your bet`,
        priority: 'HIGH',
        actionType: 'view_bet',
        actionData: { betId: params.betId },
        relatedBetId: params.betId,
        relatedUserId: params.filedBy
      });

      // Notify admins (TODO: implement admin notification system)
      console.log('[Dispute] Dispute filed successfully:', dispute.id);

      return dispute as Dispute;

    } catch (error) {
      console.error('[Dispute] Error filing dispute:', error);
      throw error;
    }
  }

  /**
   * Get disputes for a specific bet
   */
  static async getDisputesForBet(betId: string): Promise<Dispute[]> {
    try {
      const { data: disputes } = await client.models.Dispute.list({
        filter: { betId: { eq: betId } }
      });

      return (disputes || []) as Dispute[];

    } catch (error) {
      console.error('[Dispute] Error getting disputes for bet:', error);
      return [];
    }
  }

  /**
   * Get user's dispute history
   */
  static async getUserDisputes(userId: string): Promise<Dispute[]> {
    try {
      const { data: disputes } = await client.models.Dispute.list({
        filter: { filedBy: { eq: userId } }
      });

      return (disputes || []) as Dispute[];

    } catch (error) {
      console.error('[Dispute] Error getting user disputes:', error);
      return [];
    }
  }

  /**
   * Get all pending disputes (admin function)
   */
  static async getPendingDisputes(): Promise<Dispute[]> {
    try {
      const { data: disputes } = await client.models.Dispute.list({
        filter: {
          or: [
            { status: { eq: 'PENDING' } },
            { status: { eq: 'UNDER_REVIEW' } }
          ]
        }
      });

      return (disputes || []) as Dispute[];

    } catch (error) {
      console.error('[Dispute] Error getting pending disputes:', error);
      return [];
    }
  }

  /**
   * Resolve a dispute (admin function)
   * This will be called from the admin dashboard
   */
  static async resolveDispute(
    disputeId: string,
    status: DisputeStatus,
    resolution: string,
    resolvedBy: string,
    adminNotes?: string
  ): Promise<boolean> {
    try {
      console.log('[Dispute] Resolving dispute:', disputeId, status);

      // Validate admin role
      const { data: admin } = await client.models.User.get({ id: resolvedBy });
      if (!admin || (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN')) {
        console.error('[Dispute] Unauthorized: User is not an admin');
        return false;
      }

      // Get dispute details
      const { data: dispute } = await client.models.Dispute.get({ id: disputeId });
      if (!dispute) {
        console.error('[Dispute] Dispute not found');
        return false;
      }

      // Update dispute
      const { data: updatedDispute, errors } = await client.models.Dispute.update({
        id: disputeId,
        status,
        resolution,
        resolvedBy,
        adminNotes,
        resolvedAt: new Date().toISOString()
      });

      if (errors || !updatedDispute) {
        console.error('[Dispute] Error updating dispute:', errors);
        return false;
      }

      // Get bet details
      const { data: bet } = await client.models.Bet.get({ id: dispute.betId });
      if (!bet) {
        console.error('[Dispute] Bet not found');
        return false;
      }

      // If resolved for filer, need to recalculate payouts
      // This logic will be handled by TrustScoreService and transaction reversal
      // For now, just update bet status back to PENDING_RESOLUTION for admin to manually fix

      if (status === 'RESOLVED_FOR_FILER') {
        // Dispute upheld - creator was wrong
        await client.models.Bet.update({
          id: dispute.betId,
          status: 'PENDING_RESOLUTION'
        });

        // Apply trust score penalties and rewards
        try {
          // Creator loses trust for resolving bet unfairly (-2.0)
          await TrustScoreService.penaltyForLostDisputeCreator(
            dispute.againstUserId,
            dispute.betId,
            disputeId
          );
          console.log('[Dispute] Applied -2.0 penalty to creator for losing dispute');

          // Filer gains trust for correctly challenging unfair resolution (+0.3)
          await TrustScoreService.rewardForWonDisputeParticipant(
            dispute.filedBy,
            dispute.betId,
            disputeId
          );
          console.log('[Dispute] Applied +0.3 reward to filer for winning dispute');
        } catch (trustError) {
          console.error('[Dispute] Error updating trust scores:', trustError);
        }

        // Send notification to filer
        await NotificationService.createNotification({
          userId: dispute.filedBy,
          type: 'BET_DISPUTED',
          title: 'Dispute Resolved',
          message: `Your dispute was upheld. The bet resolution will be corrected.`,
          priority: 'HIGH',
          actionType: 'view_bet',
          actionData: { betId: dispute.betId },
          relatedBetId: dispute.betId
        });

        // Send notification to creator
        await NotificationService.createNotification({
          userId: dispute.againstUserId,
          type: 'BET_DISPUTED',
          title: 'Dispute Resolved Against You',
          message: `A dispute on your bet was upheld. Please resolve the bet correctly.`,
          priority: 'URGENT',
          actionType: 'view_bet',
          actionData: { betId: dispute.betId },
          relatedBetId: dispute.betId
        });

      } else if (status === 'RESOLVED_FOR_CREATOR' || status === 'DISMISSED') {
        // Dispute dismissed - creator was right, continue with payout
        await client.models.Bet.update({
          id: dispute.betId,
          status: 'PENDING_RESOLUTION' // Will be processed by payout Lambda
        });

        // Apply trust score penalties and rewards
        try {
          // Creator gains trust for correct resolution (+0.2)
          await TrustScoreService.rewardForDisputeDismissed(
            dispute.againstUserId,
            dispute.betId,
            disputeId
          );
          console.log('[Dispute] Applied +0.2 reward to creator for dispute dismissed');

          // Filer loses trust for filing false dispute (-0.4)
          await TrustScoreService.penaltyForLostDisputeParticipant(
            dispute.filedBy,
            dispute.betId,
            disputeId
          );
          console.log('[Dispute] Applied -0.4 penalty to filer for losing dispute');
        } catch (trustError) {
          console.error('[Dispute] Error updating trust scores:', trustError);
        }

        // Send notification to filer
        await NotificationService.createNotification({
          userId: dispute.filedBy,
          type: 'BET_DISPUTED',
          title: 'Dispute Dismissed',
          message: `Your dispute was reviewed and dismissed. The original resolution stands.`,
          priority: 'MEDIUM',
          actionType: 'view_bet',
          actionData: { betId: dispute.betId },
          relatedBetId: dispute.betId
        });

        // Send notification to creator (vindication)
        await NotificationService.createNotification({
          userId: dispute.againstUserId,
          type: 'BET_DISPUTED',
          title: 'Dispute Dismissed',
          message: `The dispute on your bet was dismissed. Your resolution was correct.`,
          priority: 'MEDIUM',
          actionType: 'view_bet',
          actionData: { betId: dispute.betId },
          relatedBetId: dispute.betId
        });
      }

      console.log('[Dispute] Dispute resolved successfully');
      return true;

    } catch (error) {
      console.error('[Dispute] Error resolving dispute:', error);
      return false;
    }
  }
}
