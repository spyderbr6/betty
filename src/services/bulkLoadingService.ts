/**
 * Bulk Loading Service
 * Optimizes data fetching by reducing N+1 queries to 2 queries total
 * Includes pagination, limits, and throttling controls for large datasets
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { Bet, Participant } from '../types/betting';

// Configuration constants
const BULK_LOADING_CONFIG = {
  MAX_BETS_PER_QUERY: 100,           // Limit bet queries to 100 records
  MAX_PARTICIPANTS_PER_QUERY: 500,   // Limit participant queries to 500 records
  QUERY_TIMEOUT_MS: 10000,           // 10 second timeout for queries
  MAX_CONCURRENT_QUERIES: 3,         // Limit concurrent API calls
  CACHE_TTL_MS: 30000,               // 30 second cache TTL
} as const;

// Simple in-memory cache
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

class BulkLoadingCache {
  private cache = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > BULK_LOADING_CONFIG.CACHE_TTL_MS;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > BULK_LOADING_CONFIG.CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new BulkLoadingCache();

// Cleanup cache every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

const client = generateClient<Schema>();

// Helper function to transform Amplify data to our Bet type
const transformAmplifyBet = (bet: any): Bet | null => {
  // Skip bets with missing required fields
  if (!bet.id || !bet.title || !bet.description || !bet.category || !bet.status) {
    return null;
  }

  // Parse odds from JSON string if needed
  let parsedOdds = { sideAName: 'Side A', sideBName: 'Side B' }; // Default side names
  if (bet.odds) {
    try {
      if (typeof bet.odds === 'string') {
        parsedOdds = JSON.parse(bet.odds);
      } else if (typeof bet.odds === 'object') {
        parsedOdds = bet.odds;
      }
    } catch (error) {
      console.error('Error parsing bet odds:', error);
      // Use default side names on parse error
    }
  }

  return {
    id: bet.id,
    title: bet.title,
    description: bet.description,
    category: bet.category,
    status: bet.status,
    creatorId: bet.creatorId || '',
    totalPot: bet.totalPot || 0,
    betAmount: bet.betAmount || bet.totalPot || 0, // Fallback to totalPot for existing bets
    odds: parsedOdds,
    deadline: bet.deadline || new Date().toISOString(),
    winningSide: bet.winningSide || undefined,
    resolutionReason: bet.resolutionReason || undefined,
    createdAt: bet.createdAt || new Date().toISOString(),
    updatedAt: bet.updatedAt || new Date().toISOString(),
    participants: [], // Will be populated by bulk loading
  };
};

// Helper function to transform Amplify participant data
const transformAmplifyParticipant = (participant: any): Participant | null => {
  if (!participant.id || !participant.betId || !participant.userId || !participant.side) {
    return null;
  }

  return {
    id: participant.id,
    betId: participant.betId,
    userId: participant.userId,
    side: participant.side,
    amount: participant.amount || 0,
    status: participant.status as 'PENDING' | 'ACCEPTED' | 'DECLINED',
    payout: participant.payout || 0,
    joinedAt: participant.joinedAt || new Date().toISOString(),
  };
};

// Query wrapper with timeout and error handling
const queryWithTimeout = async <T>(
  queryPromise: Promise<T>,
  operation: string,
  timeoutMs: number = BULK_LOADING_CONFIG.QUERY_TIMEOUT_MS
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([queryPromise, timeoutPromise]);
  } catch (error) {
    console.error(`❌ ${operation} failed:`, error);
    throw error;
  }
};

// Paginated bet loading with limits
const loadBetsWithPagination = async (
  statusFilters: string[],
  limit: number = BULK_LOADING_CONFIG.MAX_BETS_PER_QUERY
): Promise<any[]> => {
  const allBets: any[] = [];
  let nextToken: string | undefined;
  let pageCount = 0;
  const maxPages = Math.ceil(1000 / limit); // Hard limit: max 1000 bets total

  do {
    pageCount++;
    if (pageCount > maxPages) {
      console.warn(`⚠️ Reached maximum page limit (${maxPages}). Some bets may not be loaded.`);
      break;
    }


    const query = client.models.Bet.list({
      filter: {
        or: statusFilters.map(status => ({ status: { eq: status } }))
      },
      limit,
      nextToken,
    });

    const result = await queryWithTimeout(query, `Bet query page ${pageCount}`);

    if (result.data) {
      allBets.push(...result.data);
      nextToken = result.nextToken || undefined;
    } else {
      break;
    }


  } while (nextToken && allBets.length < 1000);

  return allBets;
};

// Paginated participant loading with limits
const loadParticipantsForBets = async (
  betIds: string[],
  limit: number = BULK_LOADING_CONFIG.MAX_PARTICIPANTS_PER_QUERY
): Promise<any[]> => {
  if (betIds.length === 0) return [];

  // If we have too many bet IDs, we need to batch them
  const maxBetIdsPerQuery = 50; // Amplify filter limit
  const batches: string[][] = [];

  for (let i = 0; i < betIds.length; i += maxBetIdsPerQuery) {
    batches.push(betIds.slice(i, i + maxBetIdsPerQuery));
  }


  const allParticipants: any[] = [];

  // Process batches with concurrency limit
  for (let i = 0; i < batches.length; i += BULK_LOADING_CONFIG.MAX_CONCURRENT_QUERIES) {
    const concurrentBatches = batches.slice(i, i + BULK_LOADING_CONFIG.MAX_CONCURRENT_QUERIES);

    const batchPromises = concurrentBatches.map(async (batchBetIds, batchIndex) => {
      const actualBatchIndex = i + batchIndex + 1;

      let batchParticipants: any[] = [];
      let nextToken: string | undefined;
      let pageCount = 0;
      const maxPages = 10; // Limit pages per batch

      do {
        pageCount++;
        if (pageCount > maxPages) {
          console.warn(`⚠️ Batch ${actualBatchIndex} reached page limit (${maxPages})`);
          break;
        }

        const query = client.models.Participant.list({
          filter: {
            or: batchBetIds.map(betId => ({ betId: { eq: betId } }))
          },
          limit,
          nextToken
        });

        const result = await queryWithTimeout(query, `Participant batch ${actualBatchIndex} page ${pageCount}`);

        if (result.data) {
          batchParticipants.push(...result.data);
          nextToken = result.nextToken || undefined;
        } else {
          break;
        }

      } while (nextToken && batchParticipants.length < limit * 5);

      return batchParticipants;
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(participants => allParticipants.push(...participants));

    // Add small delay between concurrent batch groups to avoid overwhelming the API
    if (i + BULK_LOADING_CONFIG.MAX_CONCURRENT_QUERIES < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return allParticipants;
};

/**
 * Bulk load bets with all their participants using pagination and limits
 * @param statusFilters - Array of bet statuses to filter by
 * @param options - Loading options (limit, useCache)
 * @returns Promise<Bet[]> - Array of bets with participants populated
 */
export const bulkLoadBetsWithParticipants = async (
  statusFilters: string[] = ['ACTIVE', 'LIVE', 'PENDING_RESOLUTION', 'RESOLVED'],
  options: {
    limit?: number;
    useCache?: boolean;
    forceRefresh?: boolean;
  } = {}
): Promise<Bet[]> => {
  const {
    limit = BULK_LOADING_CONFIG.MAX_BETS_PER_QUERY,
    useCache = true,
    forceRefresh = false
  } = options;

  // Generate cache key
  const cacheKey = `bets_${statusFilters.sort().join('_')}_${limit}`;

  // Check cache first (unless force refresh)
  if (useCache && !forceRefresh) {
    const cached = cache.get<Bet[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // Step 1: Fetch bets with pagination and limits
    const betsData = await loadBetsWithPagination(statusFilters, limit);

    if (betsData.length === 0) {
      return [];
    }


    // Transform and validate bets
    const validBets = betsData
      .map(transformAmplifyBet)
      .filter((bet): bet is Bet => bet !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort by createdAt descending (newest first)

    if (validBets.length === 0) {
      return [];
    }

    // Step 2: Fetch participants with batching and limits
    const betIds = validBets.map(bet => bet.id);

    const allParticipants = await loadParticipantsForBets(betIds);


    // Step 3: Group participants by betId (client-side processing)
    const participantsByBetId = new Map<string, Participant[]>();

    allParticipants.forEach(participant => {
      const transformedParticipant = transformAmplifyParticipant(participant);
      if (transformedParticipant) {
        const betId = transformedParticipant.betId;
        if (!participantsByBetId.has(betId)) {
          participantsByBetId.set(betId, []);
        }
        participantsByBetId.get(betId)!.push(transformedParticipant);
      }
    });

    // Step 4: Attach participants to their respective bets
    validBets.forEach(bet => {
      bet.participants = participantsByBetId.get(bet.id) || [];
    });

    // Cache the result
    if (useCache) {
      cache.set(cacheKey, validBets);
    }

    return validBets;
  } catch (error) {
    console.error('❌ Error in controlled bulk loading bets with participants:', error);
    throw error;
  }
};

/**
 * Bulk load only active bets (for live events screen)
 * Uses smaller limit for better performance
 */
export const bulkLoadActiveBetsWithParticipants = async (
  options: { limit?: number; useCache?: boolean; forceRefresh?: boolean } = {}
): Promise<Bet[]> => {
  const { limit = 50, ...otherOptions } = options; // Smaller limit for active bets
  return bulkLoadBetsWithParticipants(['ACTIVE'], { limit, ...otherOptions });
};

/**
 * Bulk load user's bets (created by user OR user is participant)
 * @param userId - Current user's ID
 * @param options - Loading options
 * @returns Promise<Bet[]> - User's bets with participants
 */
export const bulkLoadUserBetsWithParticipants = async (
  userId: string,
  options: { limit?: number; useCache?: boolean; forceRefresh?: boolean } = {}
): Promise<Bet[]> => {
  try {

    const cacheKey = `user_bets_${userId}_${options.limit || 100}`;

    // Check cache first (unless force refresh)
    if (options.useCache !== false && !options.forceRefresh) {
      const cached = cache.get<Bet[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get all bets first
    const allBets = await bulkLoadBetsWithParticipants(
      ['ACTIVE', 'LIVE', 'PENDING_RESOLUTION', 'RESOLVED'],
      options
    );

    // Filter to only bets where user is creator OR participant
    const userBets = allBets.filter(bet => {
      const isCreator = bet.creatorId === userId;
      const isParticipant = bet.participants?.some(p => p.userId === userId);
      return isCreator || isParticipant;
    });


    // Cache the filtered result
    if (options.useCache !== false) {
      cache.set(cacheKey, userBets);
    }

    return userBets;
  } catch (error) {
    console.error('❌ Error bulk loading user bets:', error);
    throw error;
  }
};

/**
 * Bulk load joinable bets (user is NOT creator and NOT participant)
 * @param userId - Current user's ID
 * @param options - Loading options
 * @returns Promise<Bet[]> - Joinable bets
 */
export const bulkLoadJoinableBetsWithParticipants = async (
  userId: string,
  options: { limit?: number; useCache?: boolean; forceRefresh?: boolean } = {}
): Promise<Bet[]> => {
  try {

    const cacheKey = `joinable_bets_${userId}_${options.limit || 50}`;

    // Check cache first (unless force refresh)
    if (options.useCache !== false && !options.forceRefresh) {
      const cached = cache.get<Bet[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get only active bets with smaller limit
    const activeBets = await bulkLoadActiveBetsWithParticipants({
      limit: options.limit || 50,
      useCache: options.useCache,
      forceRefresh: options.forceRefresh
    });

    // Filter to only bets where user is NOT creator and NOT participant
    const joinableBets = activeBets.filter(bet => {
      const isCreator = bet.creatorId === userId;
      const isParticipant = bet.participants?.some(p => p.userId === userId);
      return !isCreator && !isParticipant;
    });


    // Cache the filtered result
    if (options.useCache !== false) {
      cache.set(cacheKey, joinableBets);
    }

    return joinableBets;
  } catch (error) {
    console.error('❌ Error bulk loading joinable bets:', error);
    throw error;
  }
};

/**
 * Bulk load friends' joinable bets (created by friends, user is NOT creator and NOT participant)
 * @param userId - Current user's ID
 * @param options - Loading options
 * @returns Promise<Bet[]> - Friends' joinable bets
 */
export const bulkLoadFriendsBetsWithParticipants = async (
  userId: string,
  options: { limit?: number; useCache?: boolean; forceRefresh?: boolean } = {}
): Promise<Bet[]> => {
  try {
    const cacheKey = `friends_bets_${userId}_${options.limit || 50}`;

    // Check cache first (unless force refresh)
    if (options.useCache !== false && !options.forceRefresh) {
      const cached = cache.get<Bet[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // First, get user's friends list
    const [friendships1, friendships2] = await Promise.all([
      queryWithTimeout(
        client.models.Friendship.list({
          filter: { user1Id: { eq: userId } }
        }),
        'Friends list query 1'
      ),
      queryWithTimeout(
        client.models.Friendship.list({
          filter: { user2Id: { eq: userId } }
        }),
        'Friends list query 2'
      )
    ]);

    // Combine both friendship arrays to get all friend user IDs
    const allFriendships = [
      ...(friendships1.data || []),
      ...(friendships2.data || [])
    ];

    const friendUserIds = allFriendships.map(friendship =>
      friendship.user1Id === userId
        ? friendship.user2Id
        : friendship.user1Id
    ).filter(Boolean) as string[];

    if (friendUserIds.length === 0) {
      // No friends, return empty array
      return [];
    }

    // Get only active bets with smaller limit
    const activeBets = await bulkLoadActiveBetsWithParticipants({
      limit: options.limit || 50,
      useCache: options.useCache,
      forceRefresh: options.forceRefresh
    });

    // Filter to only bets created by friends where user is NOT creator and NOT participant
    const friendsBets = activeBets.filter(bet => {
      const isCreatedByFriend = friendUserIds.includes(bet.creatorId);
      const isCreator = bet.creatorId === userId;
      const isParticipant = bet.participants?.some(p => p.userId === userId);

      return isCreatedByFriend && !isCreator && !isParticipant;
    });

    // Cache the filtered result
    if (options.useCache !== false) {
      cache.set(cacheKey, friendsBets);
    }

    return friendsBets;
  } catch (error) {
    console.error('❌ Error bulk loading friends\' bets:', error);
    throw error;
  }
};

/**
 * Clear all cached data
 * Useful for force refresh scenarios
 */
export const clearBulkLoadingCache = (): void => {
  cache.clear();
};

/**
 * Get cache statistics for debugging
 */
export const getBulkLoadingCacheStats = (): { size: number; keys: string[] } => {
  const stats = {
    size: (cache as any).cache.size,
    keys: Array.from((cache as any).cache.keys()) as string[]
  };
  return stats;
};

// Export type for better intellisense
export type BulkLoadingService = {
  bulkLoadBetsWithParticipants: typeof bulkLoadBetsWithParticipants;
  bulkLoadActiveBetsWithParticipants: typeof bulkLoadActiveBetsWithParticipants;
  bulkLoadUserBetsWithParticipants: typeof bulkLoadUserBetsWithParticipants;
  bulkLoadJoinableBetsWithParticipants: typeof bulkLoadJoinableBetsWithParticipants;
  bulkLoadFriendsBetsWithParticipants: typeof bulkLoadFriendsBetsWithParticipants;
};