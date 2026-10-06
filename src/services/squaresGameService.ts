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
import { buyFailureMessage, cancelFailureMessage, parseMoneyResult, type BuyResult, type CancelResult } from './squaresMoneyLogic';

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
   * Purchase square(s) with owner name.
   *
   * One call to the server's buySquares mutation: it checks the game is open, the squares
   * free and the balance, then writes one purchase row per square, the debit and the
   * game's counts in one transaction, and locks a full grid with numbers it draws itself.
   * This phone used to create the rows, debit in a separate call, update the counts with
   * a read-then-write, and draw the grid's numbers when it filled the grid.
   * Throws with a message for the purchase sheet when the purchase did not go through.
   */
  static async purchaseSquares(params: PurchaseSquaresParams): Promise<BuyResult> {
    const { squaresGameId, userId, ownerName, squares } = params;

    let result: BuyResult | null = null;
    try {
      const { data, errors } = await client.mutations.buySquares({
        squaresGameId,
        ownerName,
        squares: JSON.stringify(squares.map((s) => ({ row: s.row, col: s.col }))),
      });
      if (errors?.length) console.error('[SquaresGame] buySquares failed:', errors);
      else result = parseMoneyResult<BuyResult>(data, ['bought', 'refused']);
    } catch (error) {
      console.error('[SquaresGame] buySquares threw:', error);
    }
    if (result?.status !== 'bought') throw new Error(buyFailureMessage(result));

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

    console.log('[SquaresGame] Purchased', result.squares, 'squares for', ownerName);
    return result;
  }

  /**
   * Cancel game and refund all participants.
   *
   * One call to the server's cancelSquaresGame mutation: it checks the caller is the
   * creator or an admin and that no period has paid out (refunding then would pay those
   * winners twice), then refunds every buyer and cancels the game in one transaction, and
   * tells the buyers. This phone used to compute and write the refunds itself.
   * Throws with a message when the cancellation did not go through.
   */
  static async cancelSquaresGame(squaresGameId: string, reason: string): Promise<boolean> {
    let result: CancelResult | null = null;
    try {
      const { data, errors } = await client.mutations.cancelSquaresGame({ squaresGameId, reason });
      if (errors?.length) console.error('[SquaresGame] cancelSquaresGame failed:', errors);
      else result = parseMoneyResult<CancelResult>(data, ['cancelled', 'refused']);
    } catch (error) {
      console.error('[SquaresGame] cancelSquaresGame threw:', error);
    }
    if (result?.status !== 'cancelled') throw new Error(cancelFailureMessage(result));
    console.log('[SquaresGame] Cancelled game and refunded', result.refunded, 'buyers');
    return true;
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

}
