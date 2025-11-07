/**
 * Transaction Service
 * Centralized service for managing all balance changes and transaction recording
 * Provides audit trail for deposits, withdrawals, bets, and payouts
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { NotificationService } from './notificationService';

const client = generateClient<Schema>();

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'BET_PLACED'
  | 'BET_WON'
  | 'BET_CANCELLED'
  | 'BET_REFUND'
  | 'ADMIN_ADJUSTMENT';

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
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  paymentMethodId?: string;
  venmoTransactionId?: string;
  venmoUsername?: string;
  relatedBetId?: string;
  relatedParticipantId?: string;
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
  status?: TransactionStatus;
  paymentMethodId?: string;
  venmoTransactionId?: string;
  venmoUsername?: string;
  relatedBetId?: string;
  relatedParticipantId?: string;
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
   * Create a new transaction and update user balance
   * This is the core method that ensures atomic balance updates
   */
  static async createTransaction(params: CreateTransactionParams): Promise<Transaction | null> {
    try {
      console.log('[Transaction] Creating transaction:', params);

      // Get current balance
      const currentBalance = await this.getUserBalance(params.userId);
      const balanceBefore = currentBalance;

      // Calculate new balance based on transaction type
      let balanceAfter = balanceBefore;
      const amount = Math.abs(params.amount); // Ensure positive amount

      // Determine if this is a credit or debit
      const isCredit = params.type === 'DEPOSIT' ||
                       params.type === 'BET_WON' ||
                       params.type === 'BET_CANCELLED' ||
                       params.type === 'BET_REFUND';

      if (isCredit) {
        balanceAfter = balanceBefore + amount;
      } else {
        balanceAfter = balanceBefore - amount;
      }

      // Validate sufficient balance for debits
      if (!isCredit && balanceAfter < 0) {
        console.error('[Transaction] Insufficient balance:', {
          userId: params.userId,
          required: amount,
          available: balanceBefore
        });
        return null;
      }

      // Create transaction record
      const { data: transaction, errors } = await client.models.Transaction.create({
        userId: params.userId,
        type: params.type,
        status: params.status || 'COMPLETED',
        amount,
        balanceBefore,
        balanceAfter,
        paymentMethodId: params.paymentMethodId,
        venmoTransactionId: params.venmoTransactionId,
        venmoUsername: params.venmoUsername,
        relatedBetId: params.relatedBetId,
        relatedParticipantId: params.relatedParticipantId,
        notes: params.notes,
        createdAt: new Date().toISOString(),
        completedAt: params.status === 'COMPLETED' ? new Date().toISOString() : undefined,
      });

      if (errors || !transaction) {
        console.error('[Transaction] Error creating transaction:', errors);
        return null;
      }

      // Update user balance only if transaction is COMPLETED
      if (params.status === 'COMPLETED' || !params.status) {
        await client.models.User.update({
          id: params.userId,
          balance: balanceAfter,
        });
        console.log('[Transaction] Balance updated:', { balanceBefore, balanceAfter });
      }

      console.log('[Transaction] Transaction created successfully:', transaction.id);

      return {
        id: transaction.id!,
        userId: transaction.userId!,
        type: transaction.type as TransactionType,
        status: transaction.status as TransactionStatus,
        amount: transaction.amount!,
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
      console.error('[Transaction] Error creating transaction:', error);
      return null;
    }
  }

  /**
   * Create a deposit transaction (Venmo → App)
   */
  static async createDeposit(
    userId: string,
    amount: number,
    paymentMethodId: string,
    venmoTransactionId?: string,
    venmoUsername?: string
  ): Promise<Transaction | null> {
    // Deposits start as PENDING until admin verifies
    const transaction = await this.createTransaction({
      userId,
      type: 'DEPOSIT',
      amount,
      status: 'PENDING',
      paymentMethodId,
      venmoTransactionId,
      venmoUsername,
      notes: `Deposit via Venmo ${venmoUsername ? `(@${venmoUsername})` : ''}`,
    });

    if (transaction) {
      console.log('[Transaction] Deposit request created, awaiting verification');
    }

    return transaction;
  }

  /**
   * Create a withdrawal transaction (App → Venmo)
   */
  static async createWithdrawal(
    userId: string,
    amount: number,
    paymentMethodId: string,
    venmoUsername: string
  ): Promise<Transaction | null> {
    // Import PaymentMethodService at runtime to avoid circular dependency
    const { PaymentMethodService } = await import('./paymentMethodService');

    // Check if payment method exists and is verified
    const paymentMethod = await PaymentMethodService.getPaymentMethod(paymentMethodId);
    if (!paymentMethod) {
      console.error('[Transaction] Payment method not found:', paymentMethodId);
      return null;
    }

    if (!paymentMethod.isVerified) {
      console.error('[Transaction] Cannot withdraw to unverified payment method:', paymentMethodId);
      return null;
    }

    // Check if user has sufficient balance
    const currentBalance = await this.getUserBalance(userId);
    if (currentBalance < amount) {
      console.error('[Transaction] Insufficient balance for withdrawal');
      return null;
    }

    // Withdrawals start as PENDING until admin processes
    const transaction = await this.createTransaction({
      userId,
      type: 'WITHDRAWAL',
      amount,
      status: 'PENDING',
      paymentMethodId,
      venmoUsername,
      notes: `Withdrawal to Venmo (@${venmoUsername})`,
    });

    if (transaction) {
      console.log('[Transaction] Withdrawal request created, awaiting processing');
    }

    return transaction;
  }

  /**
   * Record a bet placement transaction
   */
  static async recordBetPlacement(
    userId: string,
    amount: number,
    betId: string,
    participantId?: string
  ): Promise<Transaction | null> {
    return await this.createTransaction({
      userId,
      type: 'BET_PLACED',
      amount,
      status: 'COMPLETED',
      relatedBetId: betId,
      relatedParticipantId: participantId,
      notes: 'Bet placed',
    });
  }

  /**
   * Record bet winnings payout
   */
  static async recordBetWinnings(
    userId: string,
    amount: number,
    betId: string,
    participantId?: string
  ): Promise<Transaction | null> {
    const transaction = await this.createTransaction({
      userId,
      type: 'BET_WON',
      amount,
      status: 'COMPLETED',
      relatedBetId: betId,
      relatedParticipantId: participantId,
      notes: 'Bet winnings',
    });

    // Send notification about winnings
    if (transaction) {
      await NotificationService.createNotification({
        userId,
        type: 'BET_RESOLVED',
        title: 'You Won!',
        message: `You won $${amount.toFixed(2)}!`,
        priority: 'HIGH',
        relatedBetId: betId,
      });
    }

    return transaction;
  }

  /**
   * Record bet cancellation refund
   */
  static async recordBetCancellation(
    userId: string,
    amount: number,
    betId: string,
    participantId?: string
  ): Promise<Transaction | null> {
    return await this.createTransaction({
      userId,
      type: 'BET_CANCELLED',
      amount,
      status: 'COMPLETED',
      relatedBetId: betId,
      relatedParticipantId: participantId,
      notes: 'Bet cancelled - refund',
    });
  }

  /**
   * Update transaction status (for admin processing)
   * ADMIN ONLY - Requires admin user validation
   */
  static async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    failureReason?: string,
    processedBy?: string
  ): Promise<boolean> {
    try {
      // Admin role validation - check if processedBy user has admin privileges
      if (processedBy) {
        const { data: adminUser } = await client.models.User.get({ id: processedBy });
        if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'SUPER_ADMIN')) {
          console.error('[Transaction] Unauthorized: User is not an admin', processedBy);
          return false;
        }
      }

      const updateData: any = {
        id: transactionId,
        status,
      };

      if (status === 'PROCESSING') {
        updateData.processedAt = new Date().toISOString();
      }

      if (status === 'COMPLETED' || status === 'FAILED') {
        updateData.completedAt = new Date().toISOString();
      }

      if (failureReason) {
        updateData.failureReason = failureReason;
      }

      if (processedBy) {
        updateData.processedBy = processedBy;
      }

      // Get transaction to update user balance if completing a deposit/withdrawal
      const { data: transaction } = await client.models.Transaction.get({
        id: transactionId
      });

      if (!transaction) {
        console.error('[Transaction] Transaction not found:', transactionId);
        return false;
      }

      // Update transaction status
      const { errors: updateErrors } = await client.models.Transaction.update(updateData);

      if (updateErrors) {
        console.error('[Transaction] Error updating transaction:', updateErrors);
        return false;
      }

      // If completing a deposit, update user balance
      if (status === 'COMPLETED' && transaction.type === 'DEPOSIT') {
        // Get current user balance (not the old balanceAfter from the transaction)
        const currentBalance = await this.getUserBalance(transaction.userId!);
        const newBalance = currentBalance + transaction.amount!;

        console.log('[Transaction] Approving deposit:', {
          transactionId,
          amount: transaction.amount,
          currentBalance,
          newBalance
        });

        const { errors: balanceErrors } = await client.models.User.update({
          id: transaction.userId!,
          balance: newBalance,
        });

        if (balanceErrors) {
          console.error('[Transaction] Error updating user balance:', balanceErrors);
          return false;
        }

        // Auto-verify payment method on first successful deposit
        if (transaction.paymentMethodId) {
          const { PaymentMethodService } = await import('./paymentMethodService');
          const paymentMethod = await PaymentMethodService.getPaymentMethod(transaction.paymentMethodId);

          if (paymentMethod && !paymentMethod.isVerified) {
            console.log('[Transaction] Auto-verifying payment method:', transaction.paymentMethodId);
            await PaymentMethodService.verifyPaymentMethod(
              transaction.paymentMethodId,
              'TRANSACTION_ID'
            );

            // Send notification about payment method verification
            await NotificationService.createNotification({
              userId: transaction.userId!,
              type: 'PAYMENT_METHOD_VERIFIED',
              title: 'Payment Method Verified',
              message: `Your Venmo account ${paymentMethod.venmoUsername} is now verified and can be used for withdrawals`,
              priority: 'MEDIUM',
            });
          }
        }

        // Send notification
        await NotificationService.createNotification({
          userId: transaction.userId!,
          type: 'DEPOSIT_COMPLETED',
          title: 'Deposit Successful',
          message: `Your deposit of $${transaction.amount} has been completed`,
          priority: 'HIGH',
        });
      }

      // If completing a withdrawal, update user balance
      if (status === 'COMPLETED' && transaction.type === 'WITHDRAWAL') {
        // Get current user balance (not the old balanceAfter from the transaction)
        const currentBalance = await this.getUserBalance(transaction.userId!);
        const newBalance = currentBalance - transaction.amount!;

        // Validate sufficient balance for withdrawal
        if (newBalance < 0) {
          console.error('[Transaction] Insufficient balance for withdrawal:', {
            transactionId,
            amount: transaction.amount,
            currentBalance,
            shortfall: Math.abs(newBalance)
          });

          // Update transaction to FAILED with reason
          await client.models.Transaction.update({
            id: transactionId,
            status: 'FAILED',
            failureReason: `Insufficient balance. Current balance: $${currentBalance.toFixed(2)}, Withdrawal amount: $${transaction.amount!.toFixed(2)}`,
            completedAt: new Date().toISOString(),
          });

          // Send notification about failure
          await NotificationService.createNotification({
            userId: transaction.userId!,
            type: 'WITHDRAWAL_FAILED' as any,
            title: 'Withdrawal Failed',
            message: `Insufficient balance for withdrawal of $${transaction.amount}`,
            priority: 'HIGH',
          });

          return false;
        }

        console.log('[Transaction] Approving withdrawal:', {
          transactionId,
          amount: transaction.amount,
          currentBalance,
          newBalance
        });

        const { errors: balanceErrors } = await client.models.User.update({
          id: transaction.userId!,
          balance: newBalance,
        });

        if (balanceErrors) {
          console.error('[Transaction] Error updating user balance:', balanceErrors);
          return false;
        }

        // Send notification
        await NotificationService.createNotification({
          userId: transaction.userId!,
          type: 'WITHDRAWAL_COMPLETED',
          title: 'Withdrawal Complete',
          message: `Your withdrawal of $${transaction.amount} has been sent`,
          priority: 'HIGH',
        });
      }

      // If deposit/withdrawal failed, send notification
      if (status === 'FAILED' && (transaction.type === 'DEPOSIT' || transaction.type === 'WITHDRAWAL')) {
        const notificationType = transaction.type === 'DEPOSIT'
          ? 'DEPOSIT_FAILED'
          : 'WITHDRAWAL_FAILED';

        await NotificationService.createNotification({
          userId: transaction.userId!,
          type: notificationType as any,
          title: `${transaction.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} Failed`,
          message: failureReason || 'Transaction could not be completed',
          priority: 'HIGH',
        });
      }

      console.log('[Transaction] Status updated successfully:', {
        transactionId,
        status,
        type: transaction.type,
        userId: transaction.userId
      });
      return true;
    } catch (error) {
      console.error('[Transaction] Error updating transaction status:', error);
      return false;
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
      const filter: any = { userId: { eq: userId } };

      if (options.type) {
        filter.type = { eq: options.type };
      }

      if (options.status) {
        filter.status = { eq: options.status };
      }

      const { data } = await client.models.Transaction.list({
        filter,
        limit: options.limit || 50,
      });

      const transactions = (data || []).map(t => ({
        id: t.id!,
        userId: t.userId!,
        type: t.type as TransactionType,
        status: t.status as TransactionStatus,
        amount: t.amount!,
        balanceBefore: t.balanceBefore!,
        balanceAfter: t.balanceAfter!,
        paymentMethodId: t.paymentMethodId || undefined,
        venmoTransactionId: t.venmoTransactionId || undefined,
        venmoUsername: t.venmoUsername || undefined,
        relatedBetId: t.relatedBetId || undefined,
        relatedParticipantId: t.relatedParticipantId || undefined,
        notes: t.notes || undefined,
        failureReason: t.failureReason || undefined,
        processedBy: t.processedBy || undefined,
        createdAt: t.createdAt!,
        processedAt: t.processedAt || undefined,
        completedAt: t.completedAt || undefined,
      }));

      // Sort by createdAt descending (newest first)
      return transactions.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
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
      const { data } = await client.models.Transaction.list({
        filter: {
          status: { eq: 'PENDING' }
        }
      });

      const transactions = (data || []).map(t => ({
        id: t.id!,
        userId: t.userId!,
        type: t.type as TransactionType,
        status: t.status as TransactionStatus,
        amount: t.amount!,
        balanceBefore: t.balanceBefore!,
        balanceAfter: t.balanceAfter!,
        paymentMethodId: t.paymentMethodId || undefined,
        venmoTransactionId: t.venmoTransactionId || undefined,
        venmoUsername: t.venmoUsername || undefined,
        relatedBetId: t.relatedBetId || undefined,
        relatedParticipantId: t.relatedParticipantId || undefined,
        notes: t.notes || undefined,
        failureReason: t.failureReason || undefined,
        processedBy: t.processedBy || undefined,
        createdAt: t.createdAt!,
        processedAt: t.processedAt || undefined,
        completedAt: t.completedAt || undefined,
      }));

      return transactions.sort((a, b) =>
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
