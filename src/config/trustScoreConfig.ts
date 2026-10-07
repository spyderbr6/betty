/**
 * Trust score amounts and limits, used by the server (the money function adjusts trust
 * when an admin decides a deposit, a withdrawal or a dispute). Only the server writes
 * trust scores (security plan step 5). No imports, so the backend build can use it.
 */

// Trust score constants
export const MIN_TRUST_SCORE = 0;
export const MAX_TRUST_SCORE = 10;
export const DEFAULT_TRUST_SCORE = 5.0;

// Trust score thresholds for restrictions
export const TRUST_THRESHOLDS = {
  RESTRICTED: 2.0,        // Cannot create any bets, cannot withdraw
  LIMITED: 4.0,           // Cannot create public bets, delayed withdrawals
  NORMAL: 6.0,            // All normal features
  TRUSTED: 8.0,           // Faster processing, higher limits
};

// Trust score change amounts
export const TRUST_CHANGES = {
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
