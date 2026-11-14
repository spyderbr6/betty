/**
 * The squares setup's reads and writes: the games that can take squares, creating the
 * game, and inviting friends to it. The old squares form showed a friend picker but sent
 * nothing; inviting here writes the same SquaresInvitation and notification the grid's
 * invite sheet (SquaresInviteModal) does.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { notificationMeta } from '../../amplify/shared/notificationCatalog';
import { getUpcomingEventsForSquaresFromCache } from './eventCacheService';
import type { LiveEventData } from './eventService';
import { SquaresGameService } from './squaresGameService';
import { payoutStructure, type PayoutPercents } from './squaresSetupLogic';

const client = generateClient<Schema>();

/** Games in the next 14 days that have not started. */
export async function loadSquaresGames(forceRefresh = false): Promise<LiveEventData[]> {
  return getUpcomingEventsForSquaresFromCache(forceRefresh);
}

export interface CreatedSquares {
  id: string;
  title: string;
  locksAt: string;
}

export async function createSquares(params: {
  creatorId: string;
  game: { id: string; homeTeam: string; awayTeam: string; homeTeamCode?: string | null; awayTeamCode?: string | null };
  price: number;
  percents: PayoutPercents;
  description: string;
  isPrivate: boolean;
}): Promise<CreatedSquares> {
  const { game } = params;
  const created = await SquaresGameService.createSquaresGame({
    creatorId: params.creatorId,
    eventId: game.id,
    title: `${game.awayTeamCode || game.awayTeam} @ ${game.homeTeamCode || game.homeTeam} Squares`,
    description: params.description.trim() || undefined,
    pricePerSquare: params.price,
    payoutStructure: payoutStructure(params.percents),
    isPrivate: params.isPrivate,
  });
  if (!created?.id) throw new Error('Game creation returned invalid response');
  return { id: created.id, title: created.title, locksAt: created.locksAt };
}

/** Invites each friend; returns the ids invited. One failure does not stop the rest. */
export async function inviteToSquares(params: {
  gameId: string;
  locksAt: string;
  fromUserId: string;
  fromName: string;
  friendIds: string[];
}): Promise<string[]> {
  const invited = await Promise.all(
    params.friendIds.map(async (friendId) => {
      try {
        const now = new Date().toISOString();
        // Expires when the grid locks
        await client.models.SquaresInvitation.create({
          squaresGameId: params.gameId,
          fromUserId: params.fromUserId,
          toUserId: friendId,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
          expiresAt: params.locksAt || undefined,
        });
        await client.models.Notification.create({
          userId: friendId,
          type: 'SQUARES_INVITATION_RECEIVED',
          ...notificationMeta('SQUARES_INVITATION_RECEIVED'),
          title: 'Squares Game Invitation',
          message: `${params.fromName} invited you to join their squares game!`,
          priority: 'HIGH',
          isRead: false,
          actionData: JSON.stringify({ squaresGameId: params.gameId }),
          createdAt: now,
        });
        return friendId;
      } catch (error) {
        console.error(`[Squares] Error inviting ${friendId}:`, error);
        return null;
      }
    }),
  );
  return invited.filter((id): id is string => id !== null);
}
