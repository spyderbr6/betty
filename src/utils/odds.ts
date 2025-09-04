/**
 * SideBet Odds Utilities
 * Functions for odds calculations and formatting
 */

// American odds format utilities
export const oddsUtils = {
  /**
   * Format American odds with proper sign
   * @param odds - Raw odds number
   * @returns Formatted odds string (e.g., "-110", "+150")
   */
  formatAmerican: (odds: number): string => {
    if (odds > 0) {
      return `+${odds}`;
    }
    return odds.toString();
  },

  /**
   * Convert American odds to decimal odds
   * @param americanOdds - American odds (-110, +150)
   * @returns Decimal odds (1.91, 2.50)
   */
  americanToDecimal: (americanOdds: number): number => {
    if (americanOdds > 0) {
      return (americanOdds / 100) + 1;
    } else {
      return (100 / Math.abs(americanOdds)) + 1;
    }
  },

  /**
   * Convert decimal odds to American odds
   * @param decimalOdds - Decimal odds (1.91, 2.50)
   * @returns American odds (-110, +150)
   */
  decimalToAmerican: (decimalOdds: number): number => {
    if (decimalOdds >= 2.0) {
      return Math.round((decimalOdds - 1) * 100);
    } else {
      return Math.round(-100 / (decimalOdds - 1));
    }
  },

  /**
   * Calculate implied probability from American odds
   * @param americanOdds - American odds (-110, +150)
   * @returns Probability as percentage (0-100)
   */
  getImpliedProbability: (americanOdds: number): number => {
    if (americanOdds > 0) {
      return (100 / (americanOdds + 100)) * 100;
    } else {
      return (Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)) * 100;
    }
  },

  /**
   * Calculate potential payout for a bet
   * @param betAmount - Amount being bet
   * @param americanOdds - American odds (-110, +150)
   * @returns Object with potential profit and total payout
   */
  calculatePayout: (betAmount: number, americanOdds: number) => {
    let profit: number;
    
    if (americanOdds > 0) {
      profit = (betAmount * americanOdds) / 100;
    } else {
      profit = (betAmount * 100) / Math.abs(americanOdds);
    }
    
    return {
      profit: Math.round(profit * 100) / 100,
      totalPayout: Math.round((betAmount + profit) * 100) / 100,
    };
  },

  /**
   * Get odds color based on value (positive = green, negative = red)
   * @param odds - American odds
   * @returns Color string for styling
   */
  getOddsColor: (odds: number): 'positive' | 'negative' => {
    return odds > 0 ? 'positive' : 'negative';
  },

  /**
   * Calculate fair odds based on probability
   * @param probability - Probability as percentage (0-100)
   * @returns American odds
   */
  probabilityToOdds: (probability: number): number => {
    if (probability >= 50) {
      return Math.round(-100 * probability / (100 - probability));
    } else {
      return Math.round(100 * (100 - probability) / probability);
    }
  },

  /**
   * Calculate combined odds for multiple selections
   * @param odds - Array of American odds
   * @returns Combined American odds
   */
  combinedOdds: (odds: number[]): number => {
    const decimalOdds = odds.map(odd => oddsUtils.americanToDecimal(odd));
    const combinedDecimal = decimalOdds.reduce((acc, curr) => acc * curr, 1);
    return oddsUtils.decimalToAmerican(combinedDecimal);
  },
};

// Betting calculation utilities
export const betCalculations = {
  /**
   * Calculate bet distribution across sides
   * @param participants - Array of bet participants
   * @returns Distribution summary
   */
  calculateDistribution: (participants: Array<{ side: string; amount: number }>) => {
    const distribution = participants.reduce((acc, participant) => {
      if (!acc[participant.side]) {
        acc[participant.side] = {
          count: 0,
          totalAmount: 0,
        };
      }
      acc[participant.side].count += 1;
      acc[participant.side].totalAmount += participant.amount;
      return acc;
    }, {} as Record<string, { count: number; totalAmount: number }>);

    const totalPot = participants.reduce((sum, p) => sum + p.amount, 0);

    return {
      distribution,
      totalPot,
      sides: Object.keys(distribution),
    };
  },

  /**
   * Calculate dynamic odds based on betting action
   * @param sideAAmount - Total amount on side A
   * @param sideBAmount - Total amount on side B
   * @returns New odds for both sides
   */
  calculateDynamicOdds: (sideAAmount: number, sideBAmount: number) => {
    const total = sideAAmount + sideBAmount;
    const vig = 0.05; // 5% house edge
    
    if (total === 0) {
      return { sideA: -110, sideB: -110 };
    }

    const sideAProbability = sideBAmount / total;
    const sideBProbability = sideAAmount / total;
    
    // Apply vig
    const adjustedSideA = sideAProbability * (1 + vig);
    const adjustedSideB = sideBProbability * (1 + vig);
    
    return {
      sideA: oddsUtils.probabilityToOdds(adjustedSideA * 100),
      sideB: oddsUtils.probabilityToOdds(adjustedSideB * 100),
    };
  },

  /**
   * Calculate potential winnings for all participants
   * @param participants - Array of bet participants
   * @param winningSide - Which side won
   * @returns Updated participants with payouts
   */
  calculatePayouts: (
    participants: Array<{ id: string; side: string; amount: number }>,
    winningSide: string
  ) => {
    const totalPot = participants.reduce((sum, p) => sum + p.amount, 0);
    const winners = participants.filter(p => p.side === winningSide);
    const winningAmount = winners.reduce((sum, p) => sum + p.amount, 0);
    
    if (winningAmount === 0) {
      // No winners (tie scenario)
      return participants.map(p => ({ ...p, payout: p.amount }));
    }

    return participants.map(participant => {
      if (participant.side === winningSide) {
        // Winner gets their bet back plus proportional share of losing bets
        const share = participant.amount / winningAmount;
        const winnings = (totalPot - winningAmount) * share;
        return {
          ...participant,
          payout: Math.round((participant.amount + winnings) * 100) / 100,
        };
      } else {
        // Loser gets nothing
        return {
          ...participant,
          payout: 0,
        };
      }
    });
  },
};

// Validation utilities
export const oddsValidation = {
  /**
   * Validate American odds format
   * @param odds - Odds to validate
   * @returns Boolean indicating if odds are valid
   */
  isValidAmericanOdds: (odds: number): boolean => {
    // American odds should not be between -100 and +100 (except -100)
    return odds !== 0 && (odds <= -100 || odds >= 100);
  },

  /**
   * Validate bet amount
   * @param amount - Amount to validate
   * @param minBet - Minimum bet amount
   * @param maxBet - Maximum bet amount
   * @returns Validation result
   */
  isValidBetAmount: (amount: number, minBet = 1, maxBet = 10000): boolean => {
    return amount >= minBet && amount <= maxBet && amount > 0;
  },

  /**
   * Check if odds are fair (within reasonable range)
   * @param odds - Odds to check
   * @returns Boolean indicating if odds are reasonable
   */
  areOddsFair: (odds: number): boolean => {
    // Typically odds shouldn't be more extreme than +5000 or -5000
    return Math.abs(odds) <= 5000;
  },
};