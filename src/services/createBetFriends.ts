/**
 * Friends for the Create screen: the list, and which of them are checked in to the same
 * game (they come first and start invited). Moved out of CreateBetScreen.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { User } from '../types/betting';
import { getProfilePictureUrl } from './imageUploadService';

const client = generateClient<Schema>();

/** Pages of check-ins read for one game; a guard, not an expected size. */
const MAX_CHECK_IN_PAGES = 5;

export async function loadFriends(userId: string): Promise<User[]> {
  // The indexes, not .list({filter}): that is a Scan, which misses rows once the table
  // outgrows one page (the same fix BetDataContext made)
  const [friendships1, friendships2] = await Promise.all([
    client.models.Friendship.friendshipsByUser1({ user1Id: userId }),
    client.models.Friendship.friendshipsByUser2({ user2Id: userId }),
  ]);
  const friendIds = [...(friendships1.data || []), ...(friendships2.data || [])].map((friendship) =>
    friendship.user1Id === userId ? friendship.user2Id : friendship.user1Id,
  );

  const friends = await Promise.all(
    friendIds.map(async (friendId): Promise<User | null> => {
      try {
        const { data } = await client.models.User.get({ id: friendId });
        if (!data) return null;
        const profilePictureUrl = data.profilePictureUrl
          ? (await getProfilePictureUrl(data.profilePictureUrl)) || undefined
          : undefined;
        return {
          id: data.id!,
          username: data.username!,
          email: data.email!,
          displayName: data.displayName || undefined,
          profilePictureUrl,
          balance: data.balance || 0,
          trustScore: data.trustScore || 5.0,
          totalBets: data.totalBets || 0,
          totalWinnings: data.totalWinnings || 0,
          winRate: data.winRate || 0,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        } as User;
      } catch (error) {
        console.error(`[CreateBet] Error fetching friend ${friendId}:`, error);
        return null;
      }
    }),
  );
  return friends.filter((friend): friend is User => friend !== null);
}

/** Of `friendIds`, those checked in to the game now. Empty when the lookup fails. */
export async function friendIdsAtEvent(eventId: string, friendIds: string[]): Promise<Set<string>> {
  const wanted = new Set(friendIds);
  const here = new Set<string>();
  if (wanted.size === 0) return here;
  try {
    let nextToken: string | null | undefined;
    for (let page = 0; page < MAX_CHECK_IN_PAGES; page++) {
      const { data, nextToken: next } = await client.models.EventCheckIn.checkInsByEvent(
        { eventId },
        { filter: { isActive: { eq: true } }, limit: 200, nextToken },
      );
      for (const checkIn of data || []) {
        if (wanted.has(checkIn.userId)) here.add(checkIn.userId);
      }
      nextToken = next;
      if (!nextToken) break;
    }
  } catch (error) {
    console.error('[CreateBet] Error reading who is at the game:', error);
  }
  return here;
}
