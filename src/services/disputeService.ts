/**
 * Dispute Service
 * Centralized service for managing bet disputes
 * Handles dispute filing, validation, and resolution
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { fileDispute as fileDisputeOnServer } from './betStatusService';
import { fileDisputeProblem } from './betStatusLogic';
import { disputeRefusalMessage } from './disputeLogic';

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
   * File a dispute. The server's fileDispute checks the caller is a participant (not the
   * creator), that the result has not been paid and its window is open, and that no other
   * dispute is open; then records it, holds the payout and notifies the creator. Throws
   * with a message for the user when it is not filed.
   */
  static async fileDispute(params: FileDisputeParams): Promise<string> {
    // The per-user limits are courtesy checks here, not rules the server enforces
    const userCheck = await this.canFileDispute(params.filedBy);
    if (!userCheck.allowed) {
      throw new Error(userCheck.reason);
    }

    const result = await fileDisputeOnServer({
      betId: params.betId,
      reason: params.reason,
      description: params.description,
      evidenceUrls: params.evidenceUrls ?? [],
    });
    const problem = fileDisputeProblem(result);
    if (problem || result?.status !== 'filed') {
      throw new Error(problem ?? 'Failed to file dispute. Please try again.');
    }
    return result.disputeId;
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
    adminNotes?: string
  ): Promise<boolean> {
    // One server call: it checks this account is in the admins group, and for an upheld
    // dispute clears the winner and cancels the bet's pending payouts together, so the
    // creator resolves again (the original winners' payouts used to stay in place and be
    // paid). It records the outcome, adjusts trust scores and notifies both sides.
    // Throws with the server's reason when it refuses, for the screen to show.
    let result: { status?: string; reason?: string } | null = null;
    try {
      const { data, errors } = await client.mutations.adminResolveDispute({
        disputeId,
        outcome: status,
        resolution,
        adminNotes,
      });
      if (errors?.length) console.error('[Dispute] adminResolveDispute failed:', errors);
      else result = typeof data === 'string' ? JSON.parse(data) : (data as typeof result);
    } catch (error) {
      console.error('[Dispute] adminResolveDispute threw:', error);
    }
    if (result?.status === 'resolved') return true;
    throw new Error(disputeRefusalMessage(result?.reason));
  }
}
