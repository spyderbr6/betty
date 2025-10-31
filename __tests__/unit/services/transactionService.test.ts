/**
 * Transaction Service Unit Tests
 * Tests for the TransactionService business logic
 */

import { TransactionService } from '../../../src/services/transactionService';
import { MockUsers, MockTransactions, MockFactory } from '../../helpers/mock-data';
import { createMockAmplifyClient } from '../../helpers/amplify-mocks';

// Mock the Amplify client
const mockClient = createMockAmplifyClient();
jest.mock('aws-amplify/data', () => ({
  generateClient: jest.fn(() => mockClient),
}));

// Mock NotificationService
jest.mock('../../../src/services/notificationService', () => ({
  NotificationService: {
    createNotification: jest.fn(() => Promise.resolve()),
  },
}));

describe('TransactionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDeposit', () => {
    it('should create a pending deposit transaction', async () => {
      const userId = MockUsers.regular.id;
      const amount = 100;
      const paymentMethodId = 'payment-method-1';
      const venmoTransactionId = 'venmo-12345';

      const transaction = await TransactionService.createDeposit(
        userId,
        amount,
        paymentMethodId,
        venmoTransactionId
      );

      expect(transaction).toBeDefined();
      expect(mockClient.models.Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'DEPOSIT',
          status: 'PENDING',
          amount,
          paymentMethodId,
          venmoTransactionId,
        })
      );
    });

    it('should not update balance until approved', async () => {
      const userId = MockUsers.regular.id;
      const userBefore = MockUsers.regular;

      await TransactionService.createDeposit(
        userId,
        100,
        'payment-method-1',
        'venmo-12345'
      );

      // Balance should not be updated for PENDING deposits
      expect(mockClient.models.User.update).not.toHaveBeenCalled();
    });

    it('should throw error for invalid amount', async () => {
      await expect(
        TransactionService.createDeposit(
          MockUsers.regular.id,
          -100, // Negative amount
          'payment-method-1',
          'venmo-12345'
        )
      ).rejects.toThrow();
    });
  });

  describe('createWithdrawal', () => {
    it('should create a pending withdrawal transaction', async () => {
      const userId = MockUsers.regular.id;
      const amount = 50;
      const paymentMethodId = 'payment-method-1';
      const venmoUsername = '@testuser';

      const transaction = await TransactionService.createWithdrawal(
        userId,
        amount,
        paymentMethodId,
        venmoUsername
      );

      expect(transaction).toBeDefined();
      expect(mockClient.models.Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          amount,
          paymentMethodId,
          venmoUsername,
        })
      );
    });

    it('should throw error for insufficient balance', async () => {
      const userId = MockUsers.lowBalance.id; // Balance: 10
      const amount = 100; // More than balance

      await expect(
        TransactionService.createWithdrawal(
          userId,
          amount,
          'payment-method-1',
          '@testuser'
        )
      ).rejects.toThrow('Insufficient balance');
    });

    it('should throw error for invalid venmo username', async () => {
      await expect(
        TransactionService.createWithdrawal(
          MockUsers.regular.id,
          50,
          'payment-method-1',
          'invalid-username' // Missing @
        )
      ).rejects.toThrow();
    });
  });

  describe('recordBetPlacement', () => {
    it('should deduct balance when bet is placed', async () => {
      const userId = MockUsers.regular.id;
      const amount = 50;
      const betId = 'test-bet-id';
      const participantId = 'test-participant-id';

      const transaction = await TransactionService.recordBetPlacement(
        userId,
        amount,
        betId,
        participantId
      );

      expect(transaction).toBeDefined();
      expect(mockClient.models.Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'BET_PLACED',
          status: 'COMPLETED',
          amount,
          relatedBetId: betId,
          relatedParticipantId: participantId,
        })
      );

      // Balance should be updated
      expect(mockClient.models.User.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          balance: expect.any(Number),
        })
      );
    });

    it('should throw error for insufficient balance', async () => {
      const userId = MockUsers.lowBalance.id; // Balance: 10
      const amount = 100; // More than balance

      await expect(
        TransactionService.recordBetPlacement(
          userId,
          amount,
          'bet-id',
          'participant-id'
        )
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('recordBetWinnings', () => {
    it('should add winnings to balance', async () => {
      const userId = MockUsers.regular.id;
      const amount = 100;
      const betId = 'test-bet-id';
      const participantId = 'test-participant-id';

      const transaction = await TransactionService.recordBetWinnings(
        userId,
        amount,
        betId,
        participantId
      );

      expect(transaction).toBeDefined();
      expect(mockClient.models.Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'BET_WON',
          status: 'COMPLETED',
          amount,
          relatedBetId: betId,
          relatedParticipantId: participantId,
        })
      );

      // Balance should be increased
      expect(mockClient.models.User.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          balance: expect.any(Number),
        })
      );
    });
  });

  describe('recordBetCancellation', () => {
    it('should refund bet amount', async () => {
      const userId = MockUsers.regular.id;
      const amount = 50;
      const betId = 'test-bet-id';
      const participantId = 'test-participant-id';

      const transaction = await TransactionService.recordBetCancellation(
        userId,
        amount,
        betId,
        participantId
      );

      expect(transaction).toBeDefined();
      expect(mockClient.models.Transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'BET_REFUND',
          status: 'COMPLETED',
          amount,
          relatedBetId: betId,
        })
      );

      // Balance should be refunded
      expect(mockClient.models.User.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: userId,
          balance: expect.any(Number),
        })
      );
    });
  });

  describe('updateTransactionStatus', () => {
    it('should update deposit status to COMPLETED and add balance', async () => {
      const transactionId = MockTransactions.pendingDeposit.id;
      const adminUserId = MockUsers.admin.id;

      const result = await TransactionService.updateTransactionStatus(
        transactionId,
        'COMPLETED',
        undefined,
        adminUserId
      );

      expect(result).toBe(true);
      expect(mockClient.models.Transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: transactionId,
          status: 'COMPLETED',
          processedBy: adminUserId,
        })
      );

      // Balance should be updated for completed deposit
      expect(mockClient.models.User.update).toHaveBeenCalled();
    });

    it('should reject deposit with failure reason', async () => {
      const transactionId = MockTransactions.pendingDeposit.id;
      const adminUserId = MockUsers.admin.id;
      const failureReason = 'Invalid Venmo transaction ID';

      const result = await TransactionService.updateTransactionStatus(
        transactionId,
        'FAILED',
        failureReason,
        adminUserId
      );

      expect(result).toBe(true);
      expect(mockClient.models.Transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: transactionId,
          status: 'FAILED',
          failureReason,
          processedBy: adminUserId,
        })
      );

      // Balance should NOT be updated for failed deposit
      expect(mockClient.models.User.update).not.toHaveBeenCalled();
    });

    it('should require admin role to update transaction', async () => {
      const transactionId = MockTransactions.pendingDeposit.id;
      const regularUserId = MockUsers.regular.id; // Not an admin

      const result = await TransactionService.updateTransactionStatus(
        transactionId,
        'COMPLETED',
        undefined,
        regularUserId
      );

      // Should fail authorization check
      expect(result).toBe(false);
    });
  });

  describe('getUserTransactions', () => {
    it('should return user transaction history', async () => {
      const userId = MockUsers.regular.id;

      const transactions = await TransactionService.getUserTransactions(userId);

      expect(transactions).toBeDefined();
      expect(Array.isArray(transactions)).toBe(true);
      expect(mockClient.models.Transaction.list).toHaveBeenCalled();
    });

    it('should filter by transaction type', async () => {
      const userId = MockUsers.regular.id;

      const transactions = await TransactionService.getUserTransactions(userId, {
        type: 'DEPOSIT',
      });

      expect(transactions).toBeDefined();
      expect(mockClient.models.Transaction.list).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            userId: { eq: userId },
            type: { eq: 'DEPOSIT' },
          }),
        })
      );
    });
  });

  describe('getPendingTransactions', () => {
    it('should return all pending transactions for admin', async () => {
      const transactions = await TransactionService.getPendingTransactions();

      expect(transactions).toBeDefined();
      expect(Array.isArray(transactions)).toBe(true);
      expect(mockClient.models.Transaction.list).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            status: { eq: 'PENDING' },
          }),
        })
      );
    });
  });
});
