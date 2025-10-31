/**
 * Bulk Loading Service Unit Tests
 * Tests for the BulkLoadingService caching and optimization logic
 */

import { BulkLoadingService } from '../../../src/services/bulkLoadingService';
import { MockBets, MockParticipants, MockUsers } from '../../helpers/mock-data';
import { createMockAmplifyClient } from '../../helpers/amplify-mocks';

// Mock the Amplify client
const mockClient = createMockAmplifyClient();
jest.mock('aws-amplify/data', () => ({
  generateClient: jest.fn(() => mockClient),
}));

describe('BulkLoadingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    BulkLoadingService.clearBulkLoadingCache();
  });

  describe('bulkLoadBetsWithParticipants', () => {
    it('should load bets with participants in 2 queries', async () => {
      const bets = await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE']);

      expect(bets).toBeDefined();
      expect(Array.isArray(bets)).toBe(true);

      // Should call list once for bets, once for participants
      expect(mockClient.models.Bet.list).toHaveBeenCalledTimes(1);
      expect(mockClient.models.BetParticipant.list).toHaveBeenCalledTimes(1);
    });

    it('should filter bets by status', async () => {
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE', 'PENDING_RESOLUTION']);

      expect(mockClient.models.Bet.list).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            or: expect.arrayContaining([
              { status: { eq: 'ACTIVE' } },
              { status: { eq: 'PENDING_RESOLUTION' } },
            ]),
          }),
        })
      );
    });

    it('should attach participants to bets', async () => {
      const bets = await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE']);

      // Bets should have participants property
      expect(bets.every(bet => 'participants' in bet)).toBe(true);
    });

    it('should sort bets by createdAt descending', async () => {
      const bets = await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE']);

      // Check that bets are sorted newest first
      for (let i = 0; i < bets.length - 1; i++) {
        const currentDate = new Date(bets[i].createdAt).getTime();
        const nextDate = new Date(bets[i + 1].createdAt).getTime();
        expect(currentDate).toBeGreaterThanOrEqual(nextDate);
      }
    });

    it('should use cache on subsequent calls', async () => {
      // First call
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], { useCache: true });

      // Reset mock call count
      jest.clearAllMocks();

      // Second call within cache TTL
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], { useCache: true });

      // Should not make API calls (using cache)
      expect(mockClient.models.Bet.list).not.toHaveBeenCalled();
      expect(mockClient.models.BetParticipant.list).not.toHaveBeenCalled();
    });

    it('should bypass cache when forceRefresh is true', async () => {
      // First call to populate cache
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], { useCache: true });

      // Reset mock call count
      jest.clearAllMocks();

      // Force refresh
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], {
        useCache: true,
        forceRefresh: true,
      });

      // Should make API calls despite cache
      expect(mockClient.models.Bet.list).toHaveBeenCalled();
      expect(mockClient.models.BetParticipant.list).toHaveBeenCalled();
    });

    it('should respect pagination limit', async () => {
      const limit = 10;
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], { limit });

      expect(mockClient.models.Bet.list).toHaveBeenCalledWith(
        expect.objectContaining({
          limit,
        })
      );
    });
  });

  describe('bulkLoadUserBetsWithParticipants', () => {
    it('should load only bets where user is creator or participant', async () => {
      const userId = MockUsers.regular.id;

      const bets = await BulkLoadingService.bulkLoadUserBetsWithParticipants(userId);

      expect(bets).toBeDefined();
      expect(Array.isArray(bets)).toBe(true);

      // All returned bets should have user as creator or participant
      bets.forEach(bet => {
        const isCreator = bet.creatorId === userId;
        const isParticipant = bet.participants?.some((p: any) => p.userId === userId);
        expect(isCreator || isParticipant).toBe(true);
      });
    });

    it('should include all bet statuses for user bets', async () => {
      const userId = MockUsers.regular.id;

      await BulkLoadingService.bulkLoadUserBetsWithParticipants(userId);

      // Should fetch bets with all possible statuses
      expect(mockClient.models.Bet.list).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({
            or: expect.arrayContaining([
              { status: { eq: 'ACTIVE' } },
              { status: { eq: 'PENDING_RESOLUTION' } },
              { status: { eq: 'RESOLVED' } },
              { status: { eq: 'CANCELLED' } },
            ]),
          }),
        })
      );
    });
  });

  describe('bulkLoadJoinableBetsWithParticipants', () => {
    it('should load only ACTIVE bets user has not joined', async () => {
      const userId = MockUsers.regular.id;

      const bets = await BulkLoadingService.bulkLoadJoinableBetsWithParticipants(userId);

      expect(bets).toBeDefined();
      expect(Array.isArray(bets)).toBe(true);

      // All returned bets should be ACTIVE
      bets.forEach(bet => {
        expect(bet.status).toBe('ACTIVE');
        expect(bet.creatorId).not.toBe(userId);
        // User should not be a participant
        const isParticipant = bet.participants?.some((p: any) => p.userId === userId);
        expect(isParticipant).toBe(false);
      });
    });

    it('should exclude bets created by user', async () => {
      const userId = MockUsers.regular.id;

      const bets = await BulkLoadingService.bulkLoadJoinableBetsWithParticipants(userId);

      // No bets should be created by this user
      expect(bets.every(bet => bet.creatorId !== userId)).toBe(true);
    });

    it('should use smaller default limit for joinable bets', async () => {
      const userId = MockUsers.regular.id;

      await BulkLoadingService.bulkLoadJoinableBetsWithParticipants(userId);

      expect(mockClient.models.Bet.list).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50, // Default smaller limit for joinable bets
        })
      );
    });
  });

  describe('clearBulkLoadingCache', () => {
    it('should clear all cached data', async () => {
      // Populate cache
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], { useCache: true });

      // Clear cache
      BulkLoadingService.clearBulkLoadingCache();

      // Reset mock call count
      jest.clearAllMocks();

      // Next call should hit API again
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], { useCache: true });

      expect(mockClient.models.Bet.list).toHaveBeenCalled();
    });
  });

  describe('getBulkLoadingCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = BulkLoadingService.getBulkLoadingCacheStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('keys');
    });

    it('should show cached keys after loading', async () => {
      await BulkLoadingService.bulkLoadBetsWithParticipants(['ACTIVE'], { useCache: true });

      const stats = BulkLoadingService.getBulkLoadingCacheStats();

      expect(stats.size).toBeGreaterThan(0);
      expect(stats.keys.length).toBeGreaterThan(0);
    });
  });
});
