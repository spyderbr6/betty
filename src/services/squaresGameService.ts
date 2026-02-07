/**
 * Squares Game Service
 *
 * Core business logic for betting squares games including:
 * - Game creation
 * - Square purchases with owner names
 * - Grid locking and number assignment
 * - Period score processing and payouts
 * - Game cancellation and refunds
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { TransactionService } from './transactionService';
import { NotificationService } from './notificationService';

const client = generateClient<Schema>();

export interface PayoutStructure {
  period1: number;
  period2: number;
  period3: number;
  period4: number;
}

export interface CreateSquaresGameParams {
  creatorId: string;
  eventId: string;
  title: string;
  description?: string;
  pricePerSquare: number;
  payoutStructure?: PayoutStructure;
  isPrivate?: boolean;
}

export interface PurchaseSquaresParams {
  squaresGameId: string;
  userId: string; // Buyer who pays
  ownerName: string; // Display name for grid (can be anyone)
  squares: Array<{ row: number; col: number }>;
}

export class SquaresGameService {
  /**
   * Create a new squares game
   */
  static async createSquaresGame(params: CreateSquaresGameParams): Promise<any> {
    try {
      const {
        creatorId,
        eventId,
        title,
        description,
        pricePerSquare,
        payoutStructure = {
          period1: 0.15,
          period2: 0.25,
          period3: 0.15,
          period4: 0.45,
        },
        isPrivate = false,
      } = params;

      // Validate payout structure totals 100%
      const total = payoutStructure.period1 + payoutStructure.period2 + payoutStructure.period3 + payoutStructure.period4;
      if (Math.abs(total - 1.0) > 0.001) {
        throw new Error('Payout structure must total 100%');
      }

      // Get event details
      const { data: event } = await client.models.LiveEvent.get({ id: eventId });
      if (!event) {
        throw new Error('Event not found');
      }

      // Create squares game
      const { data: game, errors } = await client.models.SquaresGame.create({
        creatorId,
        eventId,
        title,
        description,
        pricePerSquare,
        totalPot: 0,
        payoutStructure: JSON.stringify(payoutStructure), // Schema expects JSON string
        status: 'ACTIVE',
        squaresSold: 0,
        isPrivate,
        numbersAssigned: false,
        locksAt: event.scheduledTime, // Lock at game start time
        expiresAt: event.scheduledTime, // Will be updated when event finishes
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if (errors) {
        console.error('[SquaresGame] Error creating game:', errors);
        throw new Error('Failed to create squares game');
      }

      console.log('[SquaresGame] Created game:', game?.id);
      return game;
    } catch (error) {
      console.error('[SquaresGame] Error in createSquaresGame:', error);
      throw error;
    }
  }

  /**
   * Purchase square(s) with owner name
   */
  static async purchaseSquares(params: PurchaseSquaresParams): Promise<any[]> {
    try {
      const { squaresGameId, userId, ownerName, squares } = params;

      // Get game
      const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
      if (!game) {
        throw new Error('Game not found');
      }

      // Validate game status
      if (game.status !== 'ACTIVE' && game.status !== 'SETUP') {
        throw new Error('Game is not accepting purchases');
      }

      // Get existing purchases
      const { data: existingPurchases } = await client.models.SquaresPurchase.list({
        filter: { squaresGameId: { eq: squaresGameId } },
      });

      // Build set of occupied squares
      const occupiedSquares = new Set(
        existingPurchases?.map((p) => `${p.gridRow},${p.gridCol}`) || []
      );

      // Validate squares are available
      for (const sq of squares) {
        if (sq.row < 0 || sq.row > 9 || sq.col < 0 || sq.col > 9) {
          throw new Error(`Invalid square position: (${sq.row}, ${sq.col})`);
        }
        if (occupiedSquares.has(`${sq.row},${sq.col}`)) {
          throw new Error(`Square (${sq.row}, ${sq.col}) is already taken`);
        }
      }

      // Calculate total cost
      const totalCost = squares.length * game.pricePerSquare;

      // Check user balance
      const { data: user } = await client.models.User.get({ id: userId });
      if (!user) {
        throw new Error('User not found');
      }

      if (user.balance < totalCost) {
        throw new Error('Insufficient balance');
      }

      // Create purchases
      const purchases: any[] = [];
      const now = new Date().toISOString();

      for (const sq of squares) {
        const { data: purchase, errors } = await client.models.SquaresPurchase.create({
          squaresGameId,
          userId,
          ownerName: ownerName.trim(),
          gridRow: sq.row,
          gridCol: sq.col,
          amount: game.pricePerSquare,
          purchasedAt: now,
        });

        if (errors) {
          console.error('[SquaresGame] Error creating purchase:', errors);
          throw new Error('Failed to create purchase');
        }

        if (purchase) {
          purchases.push(purchase);
        }
      }

      // Deduct from buyer's balance
      // Build square positions string: "3 squares (A3, B5, C7)"
      const squareCount = purchases.length;
      const squarePositionsString = squareCount <= 3
        ? purchases.map(p => {
            const rowLabel = String.fromCharCode(65 + p.gridRow); // A-J
            const colLabel = p.gridCol + 1; // 1-10
            return `${rowLabel}${colLabel}`;
          }).join(', ')
        : `${squareCount} squares`;

      const transaction = await TransactionService.recordSquaresPurchase(
        userId,
        totalCost,
        squaresGameId,
        purchases.map((p) => p.id).join(','),
        game.title,
        squarePositionsString
      );

      // Update transaction IDs on purchases
      for (const purchase of purchases) {
        await client.models.SquaresPurchase.update({
          id: purchase.id,
          transactionId: transaction?.id,
        });
      }

      // Update game's squares sold count and total pot
      const newSquaresSold = game.squaresSold + squares.length;
      const newTotalPot = game.totalPot + totalCost;

      await client.models.SquaresGame.update({
        id: squaresGameId,
        squaresSold: newSquaresSold,
        totalPot: newTotalPot,
        updatedAt: new Date().toISOString(),
      });

      // Send confirmation notification
      await NotificationService.createNotification({
        userId,
        type: 'SQUARES_PURCHASE_CONFIRMED',
        title: 'Squares Purchased!',
        message: `You bought ${squares.length} square${squares.length > 1 ? 's' : ''} for ${ownerName}. Grid: ${newSquaresSold}/100`,
        priority: 'MEDIUM',
        actionData: { squaresGameId },
      });

      // Auto-accept any pending invitation for this user/game
      try {
        const { data: pendingInvitations } = await client.models.SquaresInvitation.squaresInvitationsByGame({
          squaresGameId,
        });
        const myInvitation = (pendingInvitations || []).find(
          inv => inv.toUserId === userId && inv.status === 'PENDING'
        );
        if (myInvitation) {
          await client.models.SquaresInvitation.update({
            id: myInvitation.id,
            status: 'ACCEPTED',
            updatedAt: new Date().toISOString(),
          });
          console.log('[SquaresGame] Auto-accepted invitation', myInvitation.id);
        }
      } catch (invError) {
        console.warn('[SquaresGame] Failed to auto-accept invitation:', invError);
      }

      // Check if grid is now full (100 squares)
      if (newSquaresSold >= 100) {
        await this.lockGridAndAssignNumbers(squaresGameId);
      }

      console.log('[SquaresGame] Purchased', squares.length, 'squares for', ownerName);
      return purchases;
    } catch (error) {
      console.error('[SquaresGame] Error in purchaseSquares:', error);
      throw error;
    }
  }

  /**
   * Lock grid and assign random numbers
   */
  static async lockGridAndAssignNumbers(squaresGameId: string): Promise<boolean> {
    try {
      const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
      if (!game) {
        throw new Error('Game not found');
      }

      // Already locked
      if (game.numbersAssigned) {
        console.log('[SquaresGame] Grid already locked:', squaresGameId);
        return true;
      }

      // Generate random numbers
      const rowNumbers = this.shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const colNumbers = this.shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      // Update game
      await client.models.SquaresGame.update({
        id: squaresGameId,
        rowNumbers,
        colNumbers,
        numbersAssigned: true,
        status: 'LOCKED',
        updatedAt: new Date().toISOString(),
      });

      // Get all buyers (unique userIds)
      const { data: purchases } = await client.models.SquaresPurchase.list({
        filter: { squaresGameId: { eq: squaresGameId } },
      });

      const buyerIds = new Set(purchases?.map((p) => p.userId) || []);

      // Send notifications to all buyers
      for (const buyerId of buyerIds) {
        await NotificationService.createNotification({
          userId: buyerId,
          type: 'SQUARES_GRID_LOCKED',
          title: 'Numbers Assigned!',
          message: 'Grid is locked and numbers have been assigned. Good luck!',
          priority: 'HIGH',
          actionData: { squaresGameId },
        });
      }

      console.log('[SquaresGame] Locked grid and assigned numbers:', squaresGameId);
      return true;
    } catch (error) {
      console.error('[SquaresGame] Error in lockGridAndAssignNumbers:', error);
      throw error;
    }
  }

  /**
   * Process period scores and create payout
   */
  static async processPeriodScores(
    squaresGameId: string,
    period: number,
    homeScore: number,
    awayScore: number
  ): Promise<any | null> {
    try {
      const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
      if (!game) {
        throw new Error('Game not found');
      }

      // Check if period already paid
      const periodEnum = `PERIOD_${period}` as 'PERIOD_1' | 'PERIOD_2' | 'PERIOD_3' | 'PERIOD_4' | 'PERIOD_5' | 'PERIOD_6';
      const { data: existingPayouts } = await client.models.SquaresPayout.list({
        filter: {
          squaresGameId: { eq: squaresGameId },
          period: { eq: periodEnum },
        },
      });

      if (existingPayouts && existingPayouts.length > 0) {
        console.log('[SquaresGame] Period', period, 'already paid');
        return null;
      }

      // Get all purchases
      const { data: purchases } = await client.models.SquaresPurchase.list({
        filter: { squaresGameId: { eq: squaresGameId } },
      });

      if (!purchases || purchases.length === 0) {
        console.log('[SquaresGame] No purchases found');
        return null;
      }

      // Find winner
      const winningPurchase = this.findWinningSquare(game, purchases, homeScore, awayScore);

      if (!winningPurchase) {
        console.log('[SquaresGame] No owner for winning square - house wins period', period);
        return null;
      }

      // Calculate payout
      const payoutAmount = this.calculatePayout(period, game.totalPot, game.payoutStructure as any);

      // Create payout record
      const now = new Date().toISOString();
      const { data: payout, errors } = await client.models.SquaresPayout.create({
        squaresGameId,
        squaresPurchaseId: winningPurchase.id,
        userId: winningPurchase.userId,
        ownerName: winningPurchase.ownerName,
        period: periodEnum,
        amount: payoutAmount,
        homeScore: homeScore % 10,
        awayScore: awayScore % 10,
        homeScoreFull: homeScore,
        awayScoreFull: awayScore,
        status: 'COMPLETED',
        createdAt: now,
        paidAt: now,
      });

      if (errors) {
        console.error('[SquaresGame] Error creating payout:', errors);
        throw new Error('Failed to create payout');
      }

      // Credit buyer's account
      const transaction = await TransactionService.recordSquaresPayout(
        winningPurchase.userId,
        payoutAmount,
        squaresGameId,
        payout!.id,
        periodEnum
      );

      // Update payout with transaction ID
      await client.models.SquaresPayout.update({
        id: payout!.id,
        transactionId: transaction?.id,
      });

      // Send notification to buyer
      const { data: buyer } = await client.models.User.get({ id: winningPurchase.userId });
      const isSelfOwned = winningPurchase.ownerName === buyer?.displayName;

      const notificationMessage = isSelfOwned
        ? `You won Period ${period}! $${payoutAmount.toFixed(2)}`
        : `Square for "${winningPurchase.ownerName}" won Period ${period}! You received $${payoutAmount.toFixed(2)}`;

      await NotificationService.createNotification({
        userId: winningPurchase.userId,
        type: 'SQUARES_PERIOD_WINNER',
        title: '🎉 Winner!',
        message: notificationMessage,
        priority: 'HIGH',
        actionData: { squaresGameId, payoutId: payout!.id },
      });

      console.log('[SquaresGame] Period', period, 'winner:', winningPurchase.ownerName, '$' + payoutAmount);
      return payout;
    } catch (error) {
      console.error('[SquaresGame] Error in processPeriodScores:', error);
      throw error;
    }
  }

  /**
   * Cancel game and refund all participants
   */
  static async cancelSquaresGame(squaresGameId: string, reason: string): Promise<boolean> {
    try {
      const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
      if (!game) {
        throw new Error('Game not found');
      }

      // Get all purchases
      const { data: purchases } = await client.models.SquaresPurchase.list({
        filter: { squaresGameId: { eq: squaresGameId } },
      });

      if (!purchases || purchases.length === 0) {
        console.log('[SquaresGame] No purchases to refund');
        return true;
      }

      // Refund each buyer
      const refundMap = new Map<string, number>();

      for (const purchase of purchases) {
        const currentRefund = refundMap.get(purchase.userId) || 0;
        refundMap.set(purchase.userId, currentRefund + purchase.amount);
      }

      // Process refunds
      for (const [userId, amount] of refundMap.entries()) {
        await TransactionService.recordSquaresRefund(userId, amount, squaresGameId, 'multiple');
      }

      // Update game status
      await client.models.SquaresGame.update({
        id: squaresGameId,
        status: 'CANCELLED',
        resolutionReason: reason,
        updatedAt: new Date().toISOString(),
      });

      // Send notifications to all buyers
      const buyerIds = Array.from(refundMap.keys());
      for (const buyerId of buyerIds) {
        const refundAmount = refundMap.get(buyerId)!;
        await NotificationService.createNotification({
          userId: buyerId,
          type: 'SQUARES_GAME_CANCELLED',
          title: 'Game Cancelled',
          message: `${game.title} was cancelled. You received a $${refundAmount.toFixed(2)} refund.`,
          priority: 'MEDIUM',
          actionData: { squaresGameId },
        });
      }

      console.log('[SquaresGame] Cancelled game and refunded', buyerIds.length, 'buyers');
      return true;
    } catch (error) {
      console.error('[SquaresGame] Error in cancelSquaresGame:', error);
      throw error;
    }
  }

  /**
   * Get available squares for a game
   */
  static async getAvailableSquares(squaresGameId: string): Promise<Array<{ row: number; col: number }>> {
    try {
      const { data: purchases } = await client.models.SquaresPurchase.list({
        filter: { squaresGameId: { eq: squaresGameId } },
      });

      const occupiedSquares = new Set(purchases?.map((p) => `${p.gridRow},${p.gridCol}`) || []);

      const available: Array<{ row: number; col: number }> = [];
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          if (!occupiedSquares.has(`${row},${col}`)) {
            available.push({ row, col });
          }
        }
      }

      return available;
    } catch (error) {
      console.error('[SquaresGame] Error in getAvailableSquares:', error);
      throw error;
    }
  }

  /**
   * Get full game with all purchases and payouts
   */
  static async getSquaresGameWithPurchases(squaresGameId: string): Promise<{
    game: any;
    purchases: any[];
    payouts: any[];
  }> {
    try {
      const { data: game } = await client.models.SquaresGame.get({ id: squaresGameId });
      if (!game) {
        throw new Error('Game not found');
      }

      const { data: purchases } = await client.models.SquaresPurchase.list({
        filter: { squaresGameId: { eq: squaresGameId } },
      });

      const { data: payouts } = await client.models.SquaresPayout.list({
        filter: { squaresGameId: { eq: squaresGameId } },
      });

      return {
        game,
        purchases: purchases || [],
        payouts: payouts || [],
      };
    } catch (error) {
      console.error('[SquaresGame] Error in getSquaresGameWithPurchases:', error);
      throw error;
    }
  }

  // ============ PRIVATE HELPER METHODS ============

  /**
   * Find winning square based on period scores
   */
  private static findWinningSquare(
    game: any,
    purchases: any[],
    homeScore: number,
    awayScore: number
  ): any | null {
    if (!game.numbersAssigned || !game.rowNumbers || !game.colNumbers) {
      return null;
    }

    // Get last digit of each score
    const homeDigit = homeScore % 10;
    const awayDigit = awayScore % 10;

    // Find column index where colNumbers[col] === awayDigit
    const col = game.colNumbers.indexOf(awayDigit);

    // Find row index where rowNumbers[row] === homeDigit
    const row = game.rowNumbers.indexOf(homeDigit);

    if (col === -1 || row === -1) {
      return null;
    }

    // Find purchase at (row, col)
    return purchases.find((p) => p.gridRow === row && p.gridCol === col) || null;
  }

  /**
   * Calculate payout for a period
   * Supports up to 6 periods (Q1-Q4 + double OT)
   * Overtime periods (5-6) use period4's percentage as they represent final score
   */
  private static calculatePayout(period: number, totalPot: number, payoutStructure: any): number {
    const percentages = [
      payoutStructure.period1, // Period 1
      payoutStructure.period2, // Period 2 (halftime)
      payoutStructure.period3, // Period 3
      payoutStructure.period4, // Period 4 (final)
      payoutStructure.period4, // Period 5 (OT - use final period percentage)
      payoutStructure.period4, // Period 6 (2nd OT - use final period percentage)
    ];

    const percentage = percentages[period - 1];

    if (!percentage || percentage === undefined) {
      console.error(`No payout percentage defined for period ${period}`);
      return 0;
    }

    const grossPayout = totalPot * percentage;

    // Apply 3% platform fee (consistent with bet winnings)
    const platformFee = grossPayout * 0.03;
    const netPayout = grossPayout - platformFee;

    return Math.round(netPayout * 100) / 100;
  }

  /**
   * Shuffle array (Fisher-Yates algorithm)
   */
  private static shuffleArray(array: number[]): number[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
