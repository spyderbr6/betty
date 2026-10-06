/**
 * Transaction Service
 * Centralized service for managing all balance changes and transaction recording
 * Provides audit trail for deposits, withdrawals, bets, and payouts
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// Cast to any: the Transaction model has enough fields that Amplify's generated
// types exceed TypeScript's union-complexity limit (TS2590) at each call site.
const client = generateClient<Schema>() as any;

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'BET_PLACED'
  | 'BET_WON'
  | 'BET_LOST'
  | 'BET_CANCELLED'
  | 'BET_REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'SQUARES_PURCHASE'
  | 'SQUARES_PAYOUT'
  | 'SQUARES_REFUND';

export type TransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number; // Requested amount
  actualAmount?: number; // Actual amount received after fees (for deposits/withdrawals)
  platformFee: number;
  balanceBefore: number;
  balanceAfter: number;
  paymentMethodId?: string;
  venmoTransactionId?: string;
  venmoUsername?: string;
  stripePaymentIntentId?: string; // Set on card deposits — settled automatically by webhook
  relatedBetId?: string;
  relatedParticipantId?: string;
  relatedSquaresGameId?: string; // For squares game transactions
  notes?: string;
  failureReason?: string;
  processedBy?: string;
  createdAt: string;
  processedAt?: string;
  completedAt?: string;
}

export interface CreateTransactionParams {
  userId: string;
  type: TransactionType;
  amount: number;
  platformFee?: number;
  status?: TransactionStatus;
  paymentMethodId?: string;
  venmoTransactionId?: string;
  venmoUsername?: string;
  relatedBetId?: string;
  relatedParticipantId?: string;
  relatedSquaresGameId?: string;
  notes?: string;
}

export class TransactionService {

  /**
   * Get user's current balance
   */
  static async getUserBalance(userId: string): Promise<number> {
    try {
      const { data: user } = await client.models.User.get({ id: userId });
      return user?.balance || 0;
    } catch (error) {
      console.error('[Transaction] Error getting user balance:', error);
      return 0;
    }
  }

  /**
   * Total of a user's winnings that are awarded but not yet paid out (PENDING BET_WON),
   * net of fees. Used by the Account screen and the Wallet.
   *
   * Goes through the userId index rather than a filtered Scan of the whole table. A filter
   * applies to the rows read, not the rows returned, so a page can come back short or
   * empty while more matches remain: follows nextToken until it runs out.
   */
  static async getPendingPayoutTotal(userId: string): Promise<number> {
    try {
      let total = 0;
      let nextToken: string | null | undefined;
      do {
        const page = await client.models.Transaction.transactionsByUser(
          { userId },
          {
            filter: {
              and: [
                { type: { eq: 'BET_WON' } },
                { status: { eq: 'PENDING' } },
              ],
            },
            nextToken,
          }
        );
        for (const transaction of page.data || []) {
          // actualAmount is the net after fees; fall back to amount when it is absent
          total += transaction.actualAmount ?? transaction.amount ?? 0;
        }
        nextToken = page.nextToken;
      } while (nextToken);
      return total;
    } catch (error) {
      console.error('[Transaction] Error fetching pending payouts:', error);
      return 0;
    }
  }

  /**
   * Platform fees a user has paid since a point in time, for showing free members what
   * Pro would have saved.
   *
   * Counts the platformFee recorded on bet winnings and withdrawals. Squares payouts are
   * recorded already net of their fee (platformFee 0), so they are not included and the
   * total is a floor; callers should say "on bets and withdrawals".
   */
  static async getFeesPaidSince(userId: string, sinceIso: string): Promise<number> {
    try {
      let total = 0;
      let nextToken: string | null | undefined;
      do {
        const page = await client.models.Transaction.transactionsByUser(
          // createdAt is the index's sort key, so this is a key condition, not a filter
          { userId, createdAt: { ge: sinceIso } },
          { nextToken }
        );
        for (const transaction of page.data || []) {
          if (transaction.status === 'FAILED' || transaction.status === 'CANCELLED') continue;
          total += transaction.platformFee ?? 0;
        }
        nextToken = page.nextToken;
      } while (nextToken);
      return Math.round(total * 100) / 100;
    } catch (error) {
      console.error('[Transaction] Error totalling fees paid:', error);
      return 0;
    }
  }

  /**
   * Get transaction history for a user
   */
  static async getUserTransactions(
    userId: string,
    options: {
      type?: TransactionType;
      status?: TransactionStatus;
      limit?: number;
    } = {}
  ): Promise<Transaction[]> {
    try {
      // Use efficient GSI query by userId (already sorted by createdAt DESC)
      const { data } = await client.models.Transaction.transactionsByUser({
        userId: userId
      }, {
        limit: options.limit || 50,
        sortDirection: 'DESC' // Newest first
      });

      let transactions = (data || []).map((t: any) => ({
        id: t.id!,
        userId: t.userId!,
        type: t.type as TransactionType,
        status: t.status as TransactionStatus,
        amount: t.amount!,
        actualAmount: t.actualAmount || undefined,
        platformFee: t.platformFee || 0,
        balanceBefore: t.balanceBefore!,
        balanceAfter: t.balanceAfter!,
        paymentMethodId: t.paymentMethodId || undefined,
        venmoTransactionId: t.venmoTransactionId || undefined,
        venmoUsername: t.venmoUsername || undefined,
        relatedBetId: t.relatedBetId || undefined,
        relatedParticipantId: t.relatedParticipantId || undefined,
        relatedSquaresGameId: t.relatedSquaresGameId || undefined,
        notes: t.notes || undefined,
        failureReason: t.failureReason || undefined,
        processedBy: t.processedBy || undefined,
        createdAt: t.createdAt!,
        processedAt: t.processedAt || undefined,
        completedAt: t.completedAt || undefined,
      }));

      // Filter client-side by type and/or status if specified
      if (options.type) {
        transactions = transactions.filter((t: any) => t.type === options.type);
      }
      if (options.status) {
        transactions = transactions.filter((t: any) => t.status === options.status);
      }

      // Already sorted by GSI (createdAt DESC), no need to sort again
      return transactions;
    } catch (error) {
      console.error('[Transaction] Error fetching transactions:', error);
      return [];
    }
  }

  /**
   * Get pending transactions (for admin dashboard)
   */
  static async getPendingTransactions(): Promise<Transaction[]> {
    try {
      // Use efficient GSI query by status (sorted by createdAt ASC for admin queue)
      const { data } = await client.models.Transaction.transactionsByStatus({
        status: 'PENDING'
      }, {
        sortDirection: 'ASC' // Oldest first for admin processing queue
      });

      // Only return DEPOSIT and WITHDRAWAL transactions for admin approval queue
      // Other transaction types (BET_WON, BET_PLACED, etc.) should never need admin approval
      //
      // Card deposits normally settle themselves via the Stripe webhook and never
      // linger here. One that IS still PENDING means the webhook did not arrive, so
      // it stays visible as a manual recovery path. Verify the charge actually
      // succeeded in the Stripe Dashboard before approving — updateTransactionStatus
      // refuses to credit anything already marked COMPLETED, so a late webhook
      // cannot double-credit after a manual approval.
      const transactions = (data || [])
        .filter((t: any) => t.type === 'DEPOSIT' || t.type === 'WITHDRAWAL')
        .map((t: any) => ({
          id: t.id!,
          userId: t.userId!,
          type: t.type as TransactionType,
          status: t.status as TransactionStatus,
          amount: t.amount!,
          actualAmount: t.actualAmount || undefined,
          platformFee: t.platformFee || 0,
          balanceBefore: t.balanceBefore!,
          balanceAfter: t.balanceAfter!,
          paymentMethodId: t.paymentMethodId || undefined,
          venmoTransactionId: t.venmoTransactionId || undefined,
          venmoUsername: t.venmoUsername || undefined,
          stripePaymentIntentId: t.stripePaymentIntentId || undefined,
          relatedBetId: t.relatedBetId || undefined,
          relatedParticipantId: t.relatedParticipantId || undefined,
          relatedSquaresGameId: t.relatedSquaresGameId || undefined,
          notes: t.notes || undefined,
          failureReason: t.failureReason || undefined,
          processedBy: t.processedBy || undefined,
          createdAt: t.createdAt!,
          processedAt: t.processedAt || undefined,
          completedAt: t.completedAt || undefined,
        }));

      return transactions.sort((a: any, b: any) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } catch (error) {
      console.error('[Transaction] Error fetching pending transactions:', error);
      return [];
    }
  }

  /**
   * Get transaction by ID
   */
  static async getTransaction(transactionId: string): Promise<Transaction | null> {
    try {
      const { data: transaction } = await client.models.Transaction.get({
        id: transactionId
      });

      if (!transaction) {
        return null;
      }

      return {
        id: transaction.id!,
        userId: transaction.userId!,
        type: transaction.type as TransactionType,
        status: transaction.status as TransactionStatus,
        amount: transaction.amount!,
        actualAmount: transaction.actualAmount || undefined,
        platformFee: transaction.platformFee || 0,
        balanceBefore: transaction.balanceBefore!,
        balanceAfter: transaction.balanceAfter!,
        paymentMethodId: transaction.paymentMethodId || undefined,
        venmoTransactionId: transaction.venmoTransactionId || undefined,
        venmoUsername: transaction.venmoUsername || undefined,
        relatedBetId: transaction.relatedBetId || undefined,
        relatedParticipantId: transaction.relatedParticipantId || undefined,
        notes: transaction.notes || undefined,
        failureReason: transaction.failureReason || undefined,
        processedBy: transaction.processedBy || undefined,
        createdAt: transaction.createdAt!,
        processedAt: transaction.processedAt || undefined,
        completedAt: transaction.completedAt || undefined,
      };
    } catch (error) {
      console.error('[Transaction] Error fetching transaction:', error);
      return null;
    }
  }
}

export default TransactionService;
