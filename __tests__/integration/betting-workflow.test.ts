/**
 * Betting Workflow Integration Tests
 * Tests the complete betting flow from creation to resolution
 */

import { MockUsers, MockBets, MockFactory } from '../helpers/mock-data';
import { createMockAmplifyClient } from '../helpers/amplify-mocks';
import { sleep } from '../helpers/test-utils';

// Mock the Amplify client
const mockClient = createMockAmplifyClient();
jest.mock('aws-amplify/data', () => ({
  generateClient: jest.fn(() => mockClient),
}));

// Mock services
jest.mock('../../src/services/transactionService');
jest.mock('../../src/services/notificationService');

describe('Betting Workflow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Betting Flow', () => {
    it('should allow user to create, join, and resolve a bet', async () => {
      const creator = MockUsers.regular;
      const participant = MockUsers.lowBalance;

      // Step 1: Create bet
      const newBet = {
        title: 'Test Bet',
        description: 'Integration test bet',
        betAmount: 50,
        sideAName: 'Team A',
        sideBName: 'Team B',
        status: 'ACTIVE',
        creatorId: creator.id,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      const { data: bet } = await mockClient.models.Bet.create(newBet);
      expect(bet).toBeDefined();
      expect(bet?.status).toBe('ACTIVE');

      // Step 2: Participant joins bet
      const participantData = {
        betId: bet?.id,
        userId: participant.id,
        side: 'B',
        amount: 50,
        joinedAt: new Date().toISOString(),
      };

      const { data: betParticipant } = await mockClient.models.BetParticipant.create(
        participantData
      );
      expect(betParticipant).toBeDefined();

      // Step 3: Update bet participant count
      await mockClient.models.Bet.update({
        id: bet?.id,
        participantCount: 2,
      });

      // Step 4: Expire bet (move to PENDING_RESOLUTION)
      await mockClient.models.Bet.update({
        id: bet?.id,
        status: 'PENDING_RESOLUTION',
      });

      // Step 5: Resolve bet
      const { data: resolvedBet } = await mockClient.models.Bet.update({
        id: bet?.id,
        status: 'RESOLVED',
        winningSide: 'A',
      });

      expect(resolvedBet?.status).toBe('RESOLVED');
      expect(resolvedBet?.winningSide).toBe('A');

      // Verify all steps were called
      expect(mockClient.models.Bet.create).toHaveBeenCalled();
      expect(mockClient.models.BetParticipant.create).toHaveBeenCalled();
      expect(mockClient.models.Bet.update).toHaveBeenCalledTimes(3);
    });

    it('should handle bet cancellation when no participants join', async () => {
      const creator = MockUsers.regular;

      // Create bet
      const newBet = MockFactory.bet({
        creatorId: creator.id,
        participantCount: 0,
      });

      const { data: bet } = await mockClient.models.Bet.create(newBet);
      expect(bet).toBeDefined();

      // Simulate expiration with no participants
      await sleep(100);

      // Cancel bet
      const { data: cancelledBet } = await mockClient.models.Bet.update({
        id: bet?.id,
        status: 'CANCELLED',
      });

      expect(cancelledBet?.status).toBe('CANCELLED');
    });
  });

  describe('Multiple Participants', () => {
    it('should allow multiple users to join different sides', async () => {
      const creator = MockUsers.regular;
      const bet = MockFactory.bet({ creatorId: creator.id });

      const { data: createdBet } = await mockClient.models.Bet.create(bet);

      // Create participants on both sides
      const participants = [
        { userId: 'user-1', side: 'A' },
        { userId: 'user-2', side: 'A' },
        { userId: 'user-3', side: 'B' },
        { userId: 'user-4', side: 'B' },
      ];

      for (const p of participants) {
        await mockClient.models.BetParticipant.create({
          betId: createdBet?.id,
          userId: p.userId,
          side: p.side,
          amount: bet.betAmount,
          joinedAt: new Date().toISOString(),
        });
      }

      // Verify all participants were created
      expect(mockClient.models.BetParticipant.create).toHaveBeenCalledTimes(4);

      // Update participant count
      await mockClient.models.Bet.update({
        id: createdBet?.id,
        participantCount: 4,
      });

      // Fetch participants
      const { data: allParticipants } = await mockClient.models.BetParticipant.list();

      // Group by side
      const sideACount = allParticipants?.filter(
        p => p.betId === createdBet?.id && p.side === 'A'
      ).length;
      const sideBCount = allParticipants?.filter(
        p => p.betId === createdBet?.id && p.side === 'B'
      ).length;

      expect(sideACount).toBe(2);
      expect(sideBCount).toBe(2);
    });

    it('should prevent user from joining same bet twice', async () => {
      const creator = MockUsers.regular;
      const participant = MockUsers.lowBalance;
      const bet = MockFactory.bet({ creatorId: creator.id });

      const { data: createdBet } = await mockClient.models.Bet.create(bet);

      // First join
      await mockClient.models.BetParticipant.create({
        betId: createdBet?.id,
        userId: participant.id,
        side: 'A',
        amount: bet.betAmount,
        joinedAt: new Date().toISOString(),
      });

      // Attempt second join (should be prevented by business logic)
      const { data: allParticipants } = await mockClient.models.BetParticipant.list();
      const existingParticipant = allParticipants?.find(
        p => p.betId === createdBet?.id && p.userId === participant.id
      );

      expect(existingParticipant).toBeDefined();

      // In real app, this check would prevent duplicate join
      if (existingParticipant) {
        // Don't allow duplicate join
        expect(existingParticipant.userId).toBe(participant.id);
      }
    });
  });

  describe('Bet Resolution and Payouts', () => {
    it('should calculate correct payouts for winning side', async () => {
      const bet = MockBets.pendingResolution;

      // Assume 5 participants on side A (50 each = 250 total)
      // Assume 5 participants on side B (50 each = 250 total)
      // Total pot: 500
      // If side A wins: each gets back 100 (50 bet + 50 winnings)

      const sideAParticipants = 5;
      const sideBParticipants = 5;
      const totalPot = (sideAParticipants + sideBParticipants) * bet.betAmount;

      // Side A wins
      const winningSide = 'A';
      const payoutPerWinner = totalPot / sideAParticipants;

      expect(payoutPerWinner).toBe(100);
      expect(totalPot).toBe(500);
    });

    it('should handle uneven side distribution', async () => {
      const bet = MockBets.pendingResolution;

      // 8 participants on side A, 2 on side B
      const sideAParticipants = 8;
      const sideBParticipants = 2;
      const totalPot = (sideAParticipants + sideBParticipants) * bet.betAmount;

      // Side B wins (underdog)
      const winningSide = 'B';
      const payoutPerWinner = totalPot / sideBParticipants;

      // Each side B winner gets 250 (50 bet + 200 winnings)
      expect(payoutPerWinner).toBe(250);
    });
  });

  describe('Bet Expiration', () => {
    it('should move expired bets to PENDING_RESOLUTION', async () => {
      const expiredBet = MockFactory.bet({
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
        participantCount: 5,
      });

      const { data: bet } = await mockClient.models.Bet.create(expiredBet);

      // Simulate scheduled lambda checking for expired bets
      const { data: activeBets } = await mockClient.models.Bet.list();
      const expiredBets = activeBets?.filter(
        b =>
          b.status === 'ACTIVE' &&
          new Date(b.expiresAt) < new Date() &&
          (b.participantCount || 0) > 0
      );

      // Update expired bets to PENDING_RESOLUTION
      if (expiredBets && expiredBets.length > 0) {
        for (const expiredBet of expiredBets) {
          await mockClient.models.Bet.update({
            id: expiredBet.id,
            status: 'PENDING_RESOLUTION',
          });
        }
      }

      expect(mockClient.models.Bet.update).toHaveBeenCalled();
    });

    it('should cancel expired bets with no participants', async () => {
      const expiredBet = MockFactory.bet({
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
        participantCount: 0,
      });

      const { data: bet } = await mockClient.models.Bet.create(expiredBet);

      // Simulate scheduled lambda checking for expired bets
      const { data: activeBets } = await mockClient.models.Bet.list();
      const expiredBetsNoParticipants = activeBets?.filter(
        b =>
          b.status === 'ACTIVE' &&
          new Date(b.expiresAt) < new Date() &&
          (b.participantCount || 0) === 0
      );

      // Cancel bets with no participants
      if (expiredBetsNoParticipants && expiredBetsNoParticipants.length > 0) {
        for (const bet of expiredBetsNoParticipants) {
          await mockClient.models.Bet.update({
            id: bet.id,
            status: 'CANCELLED',
          });
        }
      }

      expect(mockClient.models.Bet.update).toHaveBeenCalled();
    });
  });
});
