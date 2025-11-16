/**
 * Trust Score Service
 * Centralized service for managing user trust scores
 * Applies penalties and rewards based on user behavior
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

// Trust score constants
const MIN_TRUST_SCORE = 0;
const MAX_TRUST_SCORE = 10;
const DEFAULT_TRUST_SCORE = 5.0;

// Trust score thresholds for restrictions
export const TRUST_THRESHOLDS = {
  RESTRICTED: 2.0,        // Cannot create any bets, cannot withdraw
  LIMITED: 4.0,           // Cannot create public bets, delayed withdrawals
  NORMAL: 6.0,            // All normal features
  TRUSTED: 8.0,           // Faster processing, higher limits
};

// Trust score change amounts
const TRUST_CHANGES = {
  // Severe penalties
  FAILED_TRANSACTION: -3.0,
  LOST_DISPUTE_CREATOR: -2.0,
  REPEATED_CANCELLATIONS: -2.0,
  BET_CANCELLATION_AFTER_JOINS: -0.6,

  // Moderate penalties
  BET_EXPIRED_NO_RESOLUTION: -0.8,
  LOST_DISPUTE_PARTICIPANT: -0.4,
  MULTIPLE_PENDING_DISPUTES: -0.3,

  // Minor penalties
  BET_CANCELLED_BEFORE_JOINS: -0.2,
  SLOW_RESOLUTION: -0.1,

  // Rewards
  BET_RESOLVED_CLEAN: 0.2,
  SUCCESSFUL_WITHDRAWAL: 0.15,
  SUCCESSFUL_DEPOSIT: 0.1,
  WON_DISPUTE_PARTICIPANT: 0.3,
  DISPUTE_DISMISSED: 0.2,
  MILESTONE_10_BETS: 0.5,
  MILESTONE_25_BETS: 1.0,
  MILESTONE_50_BETS: 1.5,
  CLEAN_30_DAYS: 0.3,
};

export interface TrustScoreHistory {
  id: string;
  userId: string;
  change: number;
  newScore: number;
  reason: string;
  relatedBetId?: string;
  relatedTransactionId?: string;
  relatedDisputeId?: string;
  createdAt: string;
}

export class TrustScoreService {
  /**
   * Get user's current trust score
   */
  static async getTrustScore(userId: string): Promise<number> {
    try {
      const { data: user } = await client.models.User.get({ id: userId });
      return user?.trustScore || DEFAULT_TRUST_SCORE;
    } catch (error) {
      console.error('[TrustScore] Error getting trust score:', error);
      return DEFAULT_TRUST_SCORE;
    }
  }

  /**
   * Core method to apply trust score changes
   * Records change in history and updates user's trust score
   */
  static async applyChange(
    userId: string,
    change: number,
    reason: string,
    metadata?: {
      relatedBetId?: string;
      relatedTransactionId?: string;
      relatedDisputeId?: string;
    }
  ): Promise<number> {
    try {
      console.log('[TrustScore] Applying change:', { userId, change, reason });

      // Get current trust score
      const currentScore = await this.getTrustScore(userId);

      // Calculate new score (clamped between MIN and MAX)
      const newScore = Math.max(
        MIN_TRUST_SCORE,
        Math.min(MAX_TRUST_SCORE, currentScore + change)
      );

      // Update user's trust score
      const { errors: userErrors } = await client.models.User.update({
        id: userId,
        trustScore: newScore
      });

      if (userErrors) {
        console.error('[TrustScore] Error updating user trust score:', userErrors);
        throw new Error('Failed to update trust score');
      }

      // Record in trust score history
      const { errors: historyErrors } = await client.models.TrustScoreHistory.create({
        userId,
        change,
        newScore,
        reason,
        relatedBetId: metadata?.relatedBetId,
        relatedTransactionId: metadata?.relatedTransactionId,
        relatedDisputeId: metadata?.relatedDisputeId,
        createdAt: new Date().toISOString()
      });

      if (historyErrors) {
        console.warn('[TrustScore] Error recording trust score history:', historyErrors);
      }

      console.log(`[TrustScore] Trust score updated: ${currentScore.toFixed(2)} → ${newScore.toFixed(2)} (${change >= 0 ? '+' : ''}${change})`);

      return newScore;

    } catch (error) {
      console.error('[TrustScore] Error applying trust score change:', error);
      throw error;
    }
  }

  /**
   * Get user's trust score history
   */
  static async getUserTrustHistory(userId: string, limit: number = 20): Promise<TrustScoreHistory[]> {
    try {
      const { data: history } = await client.models.TrustScoreHistory.list({
        filter: { userId: { eq: userId } },
        limit
      });

      // Sort by createdAt descending (newest first)
      const sorted = (history || []).sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return sorted as TrustScoreHistory[];

    } catch (error) {
      console.error('[TrustScore] Error getting trust history:', error);
      return [];
    }
  }

  // ========== PENALTY METHODS ==========

  /**
   * Apply penalty for failed transaction (fraud attempt)
   */
  static async penaltyForFailedTransaction(
    userId: string,
    transactionId: string,
    transactionType: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.FAILED_TRANSACTION,
      `Failed ${transactionType.toLowerCase()} - fraud attempt detected`,
      { relatedTransactionId: transactionId }
    );
  }

  /**
   * Apply penalty for losing a dispute as bet creator
   */
  static async penaltyForLostDisputeCreator(
    userId: string,
    betId: string,
    disputeId: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.LOST_DISPUTE_CREATOR,
      `Lost dispute - bet resolved unfairly`,
      { relatedBetId: betId, relatedDisputeId: disputeId }
    );
  }

  /**
   * Apply penalty for bet expiring without resolution
   */
  static async penaltyForExpiredBet(
    userId: string,
    betId: string,
    betTitle: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.BET_EXPIRED_NO_RESOLUTION,
      `Failed to resolve bet "${betTitle}" within 24h of deadline`,
      { relatedBetId: betId }
    );
  }

  /**
   * Apply penalty for bet cancellation after participants joined
   */
  static async penaltyForCancellationAfterJoins(
    userId: string,
    betId: string,
    betTitle: string,
    isRepeated: boolean = false
  ): Promise<number> {
    const change = isRepeated ? TRUST_CHANGES.REPEATED_CANCELLATIONS : TRUST_CHANGES.BET_CANCELLATION_AFTER_JOINS;
    const reason = isRepeated
      ? `Repeated bet cancellation after participants joined - pattern of abuse`
      : `Cancelled bet "${betTitle}" after participants joined`;

    return this.applyChange(userId, change, reason, { relatedBetId: betId });
  }

  /**
   * Apply penalty for bet cancellation before anyone joins
   */
  static async penaltyForCancellationBeforeJoins(
    userId: string,
    betId: string,
    betTitle: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.BET_CANCELLED_BEFORE_JOINS,
      `Cancelled bet "${betTitle}" before anyone joined`,
      { relatedBetId: betId }
    );
  }

  /**
   * Apply penalty for losing a dispute as participant
   */
  static async penaltyForLostDisputeParticipant(
    userId: string,
    betId: string,
    disputeId: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.LOST_DISPUTE_PARTICIPANT,
      `Filed false dispute - resolution was fair`,
      { relatedBetId: betId, relatedDisputeId: disputeId }
    );
  }

  /**
   * Apply penalty for slow bet resolution
   */
  static async penaltyForSlowResolution(
    userId: string,
    betId: string,
    betTitle: string,
    hoursLate: number
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.SLOW_RESOLUTION,
      `Resolved bet "${betTitle}" ${hoursLate}h late`,
      { relatedBetId: betId }
    );
  }

  // ========== REWARD METHODS ==========

  /**
   * Apply reward for clean bet resolution (no disputes)
   */
  static async rewardForCleanResolution(
    userId: string,
    betId: string,
    betTitle: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.BET_RESOLVED_CLEAN,
      `Bet "${betTitle}" resolved fairly without disputes`,
      { relatedBetId: betId }
    );
  }

  /**
   * Apply reward for successful withdrawal
   */
  static async rewardForSuccessfulWithdrawal(
    userId: string,
    transactionId: string,
    amount: number
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.SUCCESSFUL_WITHDRAWAL,
      `Successfully withdrew $${amount.toFixed(2)}`,
      { relatedTransactionId: transactionId }
    );
  }

  /**
   * Apply reward for successful deposit
   */
  static async rewardForSuccessfulDeposit(
    userId: string,
    transactionId: string,
    amount: number
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.SUCCESSFUL_DEPOSIT,
      `Successfully deposited $${amount.toFixed(2)}`,
      { relatedTransactionId: transactionId }
    );
  }

  /**
   * Apply reward for winning a dispute as participant
   */
  static async rewardForWonDisputeParticipant(
    userId: string,
    betId: string,
    disputeId: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.WON_DISPUTE_PARTICIPANT,
      `Dispute upheld - you were right to challenge the resolution`,
      { relatedBetId: betId, relatedDisputeId: disputeId }
    );
  }

  /**
   * Apply reward when dispute filed against you is dismissed
   */
  static async rewardForDisputeDismissed(
    userId: string,
    betId: string,
    disputeId: string
  ): Promise<number> {
    return this.applyChange(
      userId,
      TRUST_CHANGES.DISPUTE_DISMISSED,
      `Dispute against you was dismissed - resolution was correct`,
      { relatedBetId: betId, relatedDisputeId: disputeId }
    );
  }

  /**
   * Apply milestone rewards for clean bet resolutions
   */
  static async checkAndApplyMilestones(userId: string): Promise<void> {
    try {
      // Get count of resolved bets without disputes
      const { data: bets } = await client.models.Bet.list({
        filter: {
          and: [
            { creatorId: { eq: userId } },
            { status: { eq: 'RESOLVED' } }
          ]
        }
      });

      const resolvedCount = bets?.length || 0;

      // Check for milestones
      if (resolvedCount === 10) {
        await this.applyChange(
          userId,
          TRUST_CHANGES.MILESTONE_10_BETS,
          `Milestone: 10 bets resolved fairly`,
          {}
        );
      } else if (resolvedCount === 25) {
        await this.applyChange(
          userId,
          TRUST_CHANGES.MILESTONE_25_BETS,
          `Milestone: 25 bets resolved fairly`,
          {}
        );
      } else if (resolvedCount === 50) {
        await this.applyChange(
          userId,
          TRUST_CHANGES.MILESTONE_50_BETS,
          `Milestone: 50 bets resolved fairly - super user status!`,
          {}
        );
      }

    } catch (error) {
      console.error('[TrustScore] Error checking milestones:', error);
    }
  }

  // ========== RESTRICTION CHECKS ==========

  /**
   * Check if user can create public bets
   */
  static async canCreatePublicBet(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const trustScore = await this.getTrustScore(userId);

    if (trustScore < TRUST_THRESHOLDS.LIMITED) {
      return {
        allowed: false,
        reason: `Trust score too low (${trustScore.toFixed(1)}/10). Minimum ${TRUST_THRESHOLDS.LIMITED} required for public bets.`
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can create any bets
   */
  static async canCreateBet(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const trustScore = await this.getTrustScore(userId);

    if (trustScore < TRUST_THRESHOLDS.RESTRICTED) {
      return {
        allowed: false,
        reason: `Account restricted due to low trust score (${trustScore.toFixed(1)}/10). Contact support.`
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can withdraw funds
   */
  static async canWithdraw(userId: string): Promise<{ allowed: boolean; delayDays?: number; reason?: string }> {
    const trustScore = await this.getTrustScore(userId);

    if (trustScore < TRUST_THRESHOLDS.RESTRICTED) {
      return {
        allowed: false,
        reason: `Withdrawals disabled due to low trust score (${trustScore.toFixed(1)}/10). Contact support.`
      };
    }

    if (trustScore < TRUST_THRESHOLDS.LIMITED) {
      return {
        allowed: true,
        delayDays: 7,
        reason: `Withdrawal will be delayed 7 days due to low trust score (${trustScore.toFixed(1)}/10).`
      };
    }

    if (trustScore >= TRUST_THRESHOLDS.TRUSTED) {
      return {
        allowed: true,
        delayDays: 0,
        reason: 'Trusted user - same-day withdrawal processing'
      };
    }

    if (trustScore >= TRUST_THRESHOLDS.NORMAL) {
      return {
        allowed: true,
        delayDays: 3,
        reason: 'Normal withdrawal processing (3 days)'
      };
    }

    return {
      allowed: true,
      delayDays: 5,
      reason: 'Standard withdrawal processing'
    };
  }

  /**
   * Get maximum bet amount for user based on trust score
   */
  static async getMaxBetAmount(userId: string): Promise<number> {
    const trustScore = await this.getTrustScore(userId);

    if (trustScore < TRUST_THRESHOLDS.RESTRICTED) {
      return 0; // Cannot bet
    }

    if (trustScore < TRUST_THRESHOLDS.LIMITED) {
      return 25; // Limited
    }

    if (trustScore < TRUST_THRESHOLDS.NORMAL) {
      return 100; // Normal
    }

    if (trustScore < TRUST_THRESHOLDS.TRUSTED) {
      return 250; // Trusted
    }

    return 500; // Highly trusted
  }

  /**
   * Get trust score tier label and color
   */
  static getTrustScoreTier(trustScore: number): {
    label: string;
    color: string;
    emoji: string;
  } {
    if (trustScore < TRUST_THRESHOLDS.RESTRICTED) {
      return { label: 'Restricted', color: '#FF3B30', emoji: '🚫' };
    }

    if (trustScore < TRUST_THRESHOLDS.LIMITED) {
      return { label: 'Low Trust', color: '#FF9500', emoji: '⚠️' };
    }

    if (trustScore < TRUST_THRESHOLDS.NORMAL) {
      return { label: 'Neutral', color: '#8E8E93', emoji: '😐' };
    }

    if (trustScore < TRUST_THRESHOLDS.TRUSTED) {
      return { label: 'Trusted', color: '#34C759', emoji: '🟢' };
    }

    return { label: 'Highly Trusted', color: '#FFD700', emoji: '⭐' };
  }
}
