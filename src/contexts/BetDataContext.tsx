/**
 * BetDataContext
 * Centralized real-time state management for bets and squares games.
 * Uses targeted GraphQL subscriptions (onCreate/onUpdate/onDelete) instead of
 * observeQuery to avoid full refetches on every change.
 *
 * Both BetsScreen and LiveEventsScreen consume derived views from this context.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { useAuth } from './AuthContext';
import { Bet, BetInvitation, BetInvitationStatus, SquaresInvitation } from '../types/betting';
import { NotificationService } from '../services/notificationService';
import { TransactionService } from '../services/transactionService';
import { showAlert } from '../components/ui/CustomAlert';

const client = generateClient<Schema>();

// ─── Types ───────────────────────────────────────────────────────────────────

interface SquaresGame {
  id: string;
  creatorId: string;
  eventId: string;
  title: string;
  description?: string;
  status: string;
  pricePerSquare: number;
  totalPot: number;
  squaresSold: number;
  numbersAssigned: boolean;
  isPrivate?: boolean;
  createdAt: string;
}

interface BetDataContextValue {
  // Derived bet lists
  myBets: Bet[];
  joinableBets: Bet[];
  joinableFriendsBets: Bet[];

  // Derived squares lists
  mySquaresGames: SquaresGame[];
  joinableSquaresGames: SquaresGame[];
  joinableFriendsSquaresGames: SquaresGame[];

  // Invitations
  betInvitations: BetInvitation[];
  squaresInvitations: SquaresInvitation[];

  // Loading state
  isInitialLoading: boolean;
  isRefreshing: boolean;

  // Actions
  refresh: () => Promise<void>;
  joinBet: (bet: Bet, side: 'A' | 'B', amount: number) => Promise<boolean>;
  acceptBetInvitation: (invitation: BetInvitation, selectedSide: string) => Promise<boolean>;
  declineBetInvitation: (invitation: BetInvitation) => Promise<void>;
  declineSquaresInvitation: (invitation: SquaresInvitation) => Promise<void>;
  dismissSquaresInvitationByGame: (squaresGameId: string) => void;
}

const BetDataContext = createContext<BetDataContextValue | null>(null);

// ─── Transform helpers ───────────────────────────────────────────────────────

const transformAmplifyBet = (bet: any): Bet | null => {
  if (!bet.id || !bet.title || !bet.description || !bet.category || !bet.status) {
    return null;
  }

  let parsedOdds = { sideAName: 'Side A', sideBName: 'Side B' };
  if (bet.odds) {
    try {
      if (typeof bet.odds === 'string') {
        parsedOdds = JSON.parse(bet.odds);
      } else if (typeof bet.odds === 'object') {
        parsedOdds = bet.odds;
      }
    } catch (error) {
      console.error('Error parsing bet odds:', error);
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
    betAmount: bet.betAmount || bet.totalPot || 0,
    odds: parsedOdds,
    deadline: bet.deadline || new Date().toISOString(),
    winningSide: bet.winningSide || undefined,
    resolutionReason: bet.resolutionReason || undefined,
    disputeWindowEndsAt: bet.disputeWindowEndsAt || undefined,
    isPrivate: bet.isPrivate || false,
    sideACount: bet.sideACount || 0,
    sideBCount: bet.sideBCount || 0,
    participantUserIds: bet.participantUserIds || [],
    createdAt: bet.createdAt || new Date().toISOString(),
    updatedAt: bet.updatedAt || new Date().toISOString(),
    participants: [],
  };
};

const transformSquaresGame = (game: any): SquaresGame | null => {
  if (!game.id || !game.title || !game.creatorId) return null;
  return {
    id: game.id,
    creatorId: game.creatorId,
    eventId: game.eventId || '',
    title: game.title,
    description: game.description || undefined,
    status: game.status || 'ACTIVE',
    pricePerSquare: game.pricePerSquare || 0,
    totalPot: game.totalPot || 0,
    squaresSold: game.squaresSold || 0,
    numbersAssigned: game.numbersAssigned || false,
    isPrivate: game.isPrivate || false,
    createdAt: game.createdAt || new Date().toISOString(),
  };
};

// ─── Provider ────────────────────────────────────────────────────────────────

export const BetDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Core state stores
  const [allBets, setAllBets] = useState<Map<string, Bet>>(new Map());
  const [allSquaresGames, setAllSquaresGames] = useState<Map<string, SquaresGame>>(new Map());
  const [myPurchasedSquaresGameIds, setMyPurchasedSquaresGameIds] = useState<Set<string>>(new Set());
  const [invitedSquaresGameIds, setInvitedSquaresGameIds] = useState<Set<string>>(new Set());
  const [squaresInvitationsMap, setSquaresInvitationsMap] = useState<Map<string, SquaresInvitation>>(new Map());
  const [invitedBetIds, setInvitedBetIds] = useState<Set<string>>(new Set());
  const [betInvitationsMap, setBetInvitationsMap] = useState<Map<string, BetInvitation>>(new Map());
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());

  // Loading state
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track if we've done initial load
  const hasLoadedRef = useRef(false);

  // ─── Initial bulk load ───────────────────────────────────────────────────

  const loadAllData = useCallback(async (forRefresh = false) => {
    if (!user?.userId) return;

    try {
      if (forRefresh) setIsRefreshing(true);

      // Load all data in parallel
      const [
        activeBetsResult,
        pendingBetsResult,
        squaresGamesResult,
        myPurchasesResult,
        mySquaresInvitationsResult,
        myBetInvitationsResult,
        friendships1Result,
        friendships2Result,
      ] = await Promise.all([
        client.models.Bet.betsByStatus({ status: 'ACTIVE' as any }, { limit: 200 }),
        client.models.Bet.betsByStatus({ status: 'PENDING_RESOLUTION' as any }, { limit: 200 }),
        Promise.all([
          client.models.SquaresGame.squaresGamesByStatus({ status: 'ACTIVE' as any }, { limit: 200 }),
          client.models.SquaresGame.squaresGamesByStatus({ status: 'LOCKED' as any }, { limit: 200 }),
          client.models.SquaresGame.squaresGamesByStatus({ status: 'LIVE' as any }, { limit: 200 }),
        ]).then(([active, locked, live]) => ({
          data: [...(active.data || []), ...(locked.data || []), ...(live.data || [])],
        })),
        client.models.SquaresPurchase.list({ filter: { userId: { eq: user.userId } } }),
        client.models.SquaresInvitation.list({ filter: { toUserId: { eq: user.userId }, status: { eq: 'PENDING' } } }),
        client.models.BetInvitation.list({ filter: { toUserId: { eq: user.userId }, status: { eq: 'PENDING' } } }),
        client.models.Friendship.list({ filter: { user1Id: { eq: user.userId } } }),
        client.models.Friendship.list({ filter: { user2Id: { eq: user.userId } } }),
      ]);

      // Build bets map
      const betsMap = new Map<string, Bet>();
      const allRawBets = [...(activeBetsResult.data || []), ...(pendingBetsResult.data || [])];
      for (const rawBet of allRawBets) {
        // Skip test bets
        if (rawBet.isTestBet) continue;
        const bet = transformAmplifyBet(rawBet);
        if (bet) betsMap.set(bet.id, bet);
      }
      setAllBets(betsMap);

      // Build squares games map
      const gamesMap = new Map<string, SquaresGame>();
      for (const rawGame of (squaresGamesResult.data || [])) {
        const game = transformSquaresGame(rawGame);
        if (game) gamesMap.set(game.id, game);
      }
      setAllSquaresGames(gamesMap);

      // Build sets
      setMyPurchasedSquaresGameIds(
        new Set((myPurchasesResult.data || []).map(p => p.squaresGameId).filter(Boolean) as string[])
      );

      // Build squares invitations with enriched data
      const sqInvitations = mySquaresInvitationsResult.data || [];
      const sqInvGameIds = new Set<string>();
      const sqInvMap = new Map<string, SquaresInvitation>();

      await Promise.all(sqInvitations.map(async (inv: any) => {
        try {
          if (!inv.squaresGameId) return;
          sqInvGameIds.add(inv.squaresGameId);

          const [gameResult, fromUserResult] = await Promise.all([
            client.models.SquaresGame.get({ id: inv.squaresGameId }),
            client.models.User.get({ id: inv.fromUserId }),
          ]);

          if (!gameResult.data || !fromUserResult.data) return;

          const enriched: SquaresInvitation = {
            id: inv.id!,
            squaresGameId: inv.squaresGameId,
            fromUserId: inv.fromUserId!,
            toUserId: inv.toUserId!,
            status: inv.status || 'PENDING',
            message: inv.message || undefined,
            createdAt: inv.createdAt || new Date().toISOString(),
            updatedAt: inv.updatedAt || new Date().toISOString(),
            expiresAt: inv.expiresAt || undefined,
            squaresGame: transformSquaresGame(gameResult.data),
            fromUser: {
              id: fromUserResult.data.id!,
              username: fromUserResult.data.username!,
              email: fromUserResult.data.email!,
              displayName: fromUserResult.data.displayName || undefined,
              profilePictureUrl: fromUserResult.data.profilePictureUrl || undefined,
              balance: fromUserResult.data.balance || 0,
              trustScore: fromUserResult.data.trustScore || 5.0,
              totalBets: fromUserResult.data.totalBets || 0,
              totalWinnings: fromUserResult.data.totalWinnings || 0,
              winRate: fromUserResult.data.winRate || 0,
              createdAt: fromUserResult.data.createdAt || new Date().toISOString(),
              updatedAt: fromUserResult.data.updatedAt || new Date().toISOString(),
            },
          };

          sqInvMap.set(enriched.id, enriched);
        } catch (error) {
          console.error('Error enriching squares invitation:', error);
        }
      }));

      setInvitedSquaresGameIds(sqInvGameIds);
      setSquaresInvitationsMap(sqInvMap);

      // Build bet invitations with enriched data
      const betInvitations = myBetInvitationsResult.data || [];
      const invBetIds = new Set<string>();
      const invMap = new Map<string, BetInvitation>();

      // Enrich invitations with bet and user data
      await Promise.all(betInvitations.map(async (inv) => {
        try {
          const [betResult, fromUserResult] = await Promise.all([
            client.models.Bet.get({ id: inv.betId }),
            client.models.User.get({ id: inv.fromUserId }),
          ]);

          if (!betResult.data || !fromUserResult.data) return;

          const transformedBet = transformAmplifyBet(betResult.data);
          if (!transformedBet || transformedBet.status !== 'ACTIVE') return;

          invBetIds.add(inv.betId!);

          const enrichedInvitation: BetInvitation = {
            id: inv.id!,
            betId: inv.betId!,
            fromUserId: inv.fromUserId!,
            toUserId: inv.toUserId!,
            status: inv.status as BetInvitationStatus,
            message: inv.message || undefined,
            invitedSide: inv.invitedSide!,
            createdAt: inv.createdAt || new Date().toISOString(),
            updatedAt: inv.updatedAt || new Date().toISOString(),
            expiresAt: inv.expiresAt || new Date().toISOString(),
            bet: transformedBet,
            fromUser: {
              id: fromUserResult.data.id!,
              username: fromUserResult.data.username!,
              email: fromUserResult.data.email!,
              displayName: fromUserResult.data.displayName || undefined,
              profilePictureUrl: fromUserResult.data.profilePictureUrl || undefined,
              balance: fromUserResult.data.balance || 0,
              trustScore: fromUserResult.data.trustScore || 5.0,
              totalBets: fromUserResult.data.totalBets || 0,
              totalWinnings: fromUserResult.data.totalWinnings || 0,
              winRate: fromUserResult.data.winRate || 0,
              createdAt: fromUserResult.data.createdAt || new Date().toISOString(),
              updatedAt: fromUserResult.data.updatedAt || new Date().toISOString(),
            },
          };

          invMap.set(enrichedInvitation.id, enrichedInvitation);
        } catch (error) {
          console.error('Error enriching bet invitation:', error);
        }
      }));

      setInvitedBetIds(invBetIds);
      setBetInvitationsMap(invMap);

      // Build friend IDs
      const allFriendships = [...(friendships1Result.data || []), ...(friendships2Result.data || [])];
      const fIds = new Set<string>();
      for (const f of allFriendships) {
        const friendId = f.user1Id === user.userId ? f.user2Id : f.user1Id;
        if (friendId) fIds.add(friendId);
      }
      setFriendIds(fIds);

      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Error loading bet data:', error);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.userId]);

  // Initial load
  useEffect(() => {
    if (user?.userId && !hasLoadedRef.current) {
      loadAllData();
    }
  }, [user?.userId, loadAllData]);

  // Reset on logout
  useEffect(() => {
    if (!user) {
      setAllBets(new Map());
      setAllSquaresGames(new Map());
      setMyPurchasedSquaresGameIds(new Set());
      setInvitedSquaresGameIds(new Set());
      setSquaresInvitationsMap(new Map());
      setInvitedBetIds(new Set());
      setBetInvitationsMap(new Map());
      setFriendIds(new Set());
      hasLoadedRef.current = false;
      setIsInitialLoading(true);
    }
  }, [user]);

  // ─── Targeted subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    if (!user?.userId) return;

    const subscriptions: { unsubscribe: () => void }[] = [];

    // 1. Bet.onCreate — new bet appears
    subscriptions.push(
      client.models.Bet.onCreate().subscribe({
        next: (rawBet) => {
          if (rawBet.isTestBet) return;
          const bet = transformAmplifyBet(rawBet);
          if (bet && (bet.status === 'ACTIVE' || bet.status === 'PENDING_RESOLUTION')) {
            setAllBets(prev => {
              const updated = new Map(prev);
              updated.set(bet.id, bet);
              return updated;
            });
          }
        },
        error: (err) => console.error('Bet.onCreate subscription error:', err),
      })
    );

    // 2. Bet.onUpdate — status change, counts change, pot change
    subscriptions.push(
      client.models.Bet.onUpdate().subscribe({
        next: (rawBet) => {
          const bet = transformAmplifyBet(rawBet);
          if (!bet) return;

          setAllBets(prev => {
            const updated = new Map(prev);
            if (bet.status === 'ACTIVE' || bet.status === 'PENDING_RESOLUTION') {
              updated.set(bet.id, bet);
            } else {
              // Bet moved to RESOLVED/CANCELLED — remove from active tracking
              updated.delete(bet.id);
            }
            return updated;
          });
        },
        error: (err) => console.error('Bet.onUpdate subscription error:', err),
      })
    );

    // 3. Bet.onDelete
    subscriptions.push(
      client.models.Bet.onDelete().subscribe({
        next: (rawBet) => {
          setAllBets(prev => {
            const updated = new Map(prev);
            updated.delete(rawBet.id);
            return updated;
          });
        },
        error: (err) => console.error('Bet.onDelete subscription error:', err),
      })
    );

    // 4. SquaresGame.onCreate
    subscriptions.push(
      client.models.SquaresGame.onCreate().subscribe({
        next: (rawGame) => {
          const game = transformSquaresGame(rawGame);
          if (game && ['ACTIVE', 'LOCKED', 'LIVE'].includes(game.status)) {
            setAllSquaresGames(prev => {
              const updated = new Map(prev);
              updated.set(game.id, game);
              return updated;
            });
          }
        },
        error: (err) => console.error('SquaresGame.onCreate subscription error:', err),
      })
    );

    // 5. SquaresGame.onUpdate
    subscriptions.push(
      client.models.SquaresGame.onUpdate().subscribe({
        next: (rawGame) => {
          const game = transformSquaresGame(rawGame);
          if (!game) return;
          setAllSquaresGames(prev => {
            const updated = new Map(prev);
            if (['ACTIVE', 'LOCKED', 'LIVE'].includes(game.status)) {
              updated.set(game.id, game);
            } else {
              updated.delete(game.id);
            }
            return updated;
          });
        },
        error: (err) => console.error('SquaresGame.onUpdate subscription error:', err),
      })
    );

    // 6. SquaresGame.onDelete
    subscriptions.push(
      client.models.SquaresGame.onDelete().subscribe({
        next: (rawGame) => {
          setAllSquaresGames(prev => {
            const updated = new Map(prev);
            updated.delete(rawGame.id);
            return updated;
          });
        },
        error: (err) => console.error('SquaresGame.onDelete subscription error:', err),
      })
    );

    // 7. BetInvitation.onCreate — new invitation for current user
    subscriptions.push(
      client.models.BetInvitation.onCreate().subscribe({
        next: async (rawInv) => {
          if (rawInv.toUserId !== user.userId || rawInv.status !== 'PENDING') return;
          try {
            const [betResult, fromUserResult] = await Promise.all([
              client.models.Bet.get({ id: rawInv.betId }),
              client.models.User.get({ id: rawInv.fromUserId }),
            ]);
            if (!betResult.data || !fromUserResult.data) return;
            const transformedBet = transformAmplifyBet(betResult.data);
            if (!transformedBet || transformedBet.status !== 'ACTIVE') return;

            const enrichedInvitation: BetInvitation = {
              id: rawInv.id!,
              betId: rawInv.betId!,
              fromUserId: rawInv.fromUserId!,
              toUserId: rawInv.toUserId!,
              status: rawInv.status as BetInvitationStatus,
              message: rawInv.message || undefined,
              invitedSide: rawInv.invitedSide!,
              createdAt: rawInv.createdAt || new Date().toISOString(),
              updatedAt: rawInv.updatedAt || new Date().toISOString(),
              expiresAt: rawInv.expiresAt || new Date().toISOString(),
              bet: transformedBet,
              fromUser: {
                id: fromUserResult.data.id!,
                username: fromUserResult.data.username!,
                email: fromUserResult.data.email!,
                displayName: fromUserResult.data.displayName || undefined,
                profilePictureUrl: fromUserResult.data.profilePictureUrl || undefined,
                balance: fromUserResult.data.balance || 0,
                trustScore: fromUserResult.data.trustScore || 5.0,
                totalBets: fromUserResult.data.totalBets || 0,
                totalWinnings: fromUserResult.data.totalWinnings || 0,
                winRate: fromUserResult.data.winRate || 0,
                createdAt: fromUserResult.data.createdAt || new Date().toISOString(),
                updatedAt: fromUserResult.data.updatedAt || new Date().toISOString(),
              },
            };

            setBetInvitationsMap(prev => {
              const updated = new Map(prev);
              updated.set(enrichedInvitation.id, enrichedInvitation);
              return updated;
            });
            setInvitedBetIds(prev => {
              const updated = new Set(prev);
              updated.add(rawInv.betId!);
              return updated;
            });
          } catch (error) {
            console.error('Error processing new bet invitation:', error);
          }
        },
        error: (err) => console.error('BetInvitation.onCreate subscription error:', err),
      })
    );

    // 8. BetInvitation.onUpdate — invitation status changed
    subscriptions.push(
      client.models.BetInvitation.onUpdate().subscribe({
        next: (rawInv) => {
          if (rawInv.toUserId !== user.userId) return;
          if (rawInv.status !== 'PENDING') {
            // Invitation accepted/declined/expired — remove it
            setBetInvitationsMap(prev => {
              const updated = new Map(prev);
              updated.delete(rawInv.id);
              return updated;
            });
          }
        },
        error: (err) => console.error('BetInvitation.onUpdate subscription error:', err),
      })
    );

    // 9. Friendship.onCreate — new friend added
    subscriptions.push(
      client.models.Friendship.onCreate().subscribe({
        next: (rawFriendship) => {
          const friendId = rawFriendship.user1Id === user.userId
            ? rawFriendship.user2Id
            : rawFriendship.user1Id;
          if (friendId && (rawFriendship.user1Id === user.userId || rawFriendship.user2Id === user.userId)) {
            setFriendIds(prev => {
              const updated = new Set(prev);
              updated.add(friendId);
              return updated;
            });
          }
        },
        error: (err) => console.error('Friendship.onCreate subscription error:', err),
      })
    );

    // 10. SquaresPurchase.onCreate — track when current user buys squares
    subscriptions.push(
      client.models.SquaresPurchase.onCreate().subscribe({
        next: (rawPurchase) => {
          if (rawPurchase.userId === user.userId && rawPurchase.squaresGameId) {
            setMyPurchasedSquaresGameIds(prev => {
              const updated = new Set(prev);
              updated.add(rawPurchase.squaresGameId!);
              return updated;
            });
          }
        },
        error: (err) => console.error('SquaresPurchase.onCreate subscription error:', err),
      })
    );

    // 11. SquaresInvitation.onCreate — invitation for current user
    subscriptions.push(
      client.models.SquaresInvitation.onCreate().subscribe({
        next: async (rawInv) => {
          if (rawInv.toUserId === user.userId && rawInv.status === 'PENDING' && rawInv.squaresGameId) {
            setInvitedSquaresGameIds(prev => {
              const updated = new Set(prev);
              updated.add(rawInv.squaresGameId!);
              return updated;
            });

            // Enrich and add to invitations map
            try {
              const [gameResult, fromUserResult] = await Promise.all([
                client.models.SquaresGame.get({ id: rawInv.squaresGameId }),
                client.models.User.get({ id: rawInv.fromUserId }),
              ]);

              if (gameResult.data && fromUserResult.data) {
                const enriched: SquaresInvitation = {
                  id: rawInv.id!,
                  squaresGameId: rawInv.squaresGameId!,
                  fromUserId: rawInv.fromUserId!,
                  toUserId: rawInv.toUserId!,
                  status: rawInv.status || 'PENDING',
                  message: rawInv.message || undefined,
                  createdAt: rawInv.createdAt || new Date().toISOString(),
                  updatedAt: rawInv.updatedAt || new Date().toISOString(),
                  expiresAt: rawInv.expiresAt || undefined,
                  squaresGame: transformSquaresGame(gameResult.data),
                  fromUser: {
                    id: fromUserResult.data.id!,
                    username: fromUserResult.data.username!,
                    email: fromUserResult.data.email!,
                    displayName: fromUserResult.data.displayName || undefined,
                    profilePictureUrl: fromUserResult.data.profilePictureUrl || undefined,
                    balance: fromUserResult.data.balance || 0,
                    trustScore: fromUserResult.data.trustScore || 5.0,
                    totalBets: fromUserResult.data.totalBets || 0,
                    totalWinnings: fromUserResult.data.totalWinnings || 0,
                    winRate: fromUserResult.data.winRate || 0,
                    createdAt: fromUserResult.data.createdAt || new Date().toISOString(),
                    updatedAt: fromUserResult.data.updatedAt || new Date().toISOString(),
                  },
                };

                setSquaresInvitationsMap(prev => {
                  const updated = new Map(prev);
                  updated.set(enriched.id, enriched);
                  return updated;
                });
              }
            } catch (error) {
              console.error('Error enriching squares invitation:', error);
            }
          }
        },
        error: (err) => console.error('SquaresInvitation.onCreate subscription error:', err),
      })
    );

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, [user?.userId]);

  // ─── Derived state (useMemo) ─────────────────────────────────────────────

  const myBets = useMemo((): Bet[] => {
    if (!user?.userId) return [];
    const bets: Bet[] = Array.from(allBets.values());
    return bets
      .filter((bet: Bet) => {
        const isCreator = bet.creatorId === user.userId;
        const isParticipant = (bet.participantUserIds || []).includes(user.userId);
        return isCreator || isParticipant;
      })
      .sort((a: Bet, b: Bet) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allBets, user?.userId]);

  const joinableBets = useMemo((): Bet[] => {
    if (!user?.userId) return [];
    const bets: Bet[] = Array.from(allBets.values());
    return bets
      .filter((bet: Bet) => {
        if (bet.status !== 'ACTIVE') return false;
        if (bet.creatorId === user.userId) return false;
        if ((bet.participantUserIds || []).includes(user.userId)) return false;
        if (bet.isPrivate && !invitedBetIds.has(bet.id)) return false;
        return true;
      })
      .sort((a: Bet, b: Bet) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allBets, user?.userId, invitedBetIds]);

  const joinableFriendsBets = useMemo(() => {
    return joinableBets.filter(bet => friendIds.has(bet.creatorId));
  }, [joinableBets, friendIds]);

  const mySquaresGames = useMemo((): SquaresGame[] => {
    if (!user?.userId) return [];
    const games: SquaresGame[] = Array.from(allSquaresGames.values());
    return games
      .filter((game: SquaresGame) => {
        const isCreator = game.creatorId === user.userId;
        const hasPurchased = myPurchasedSquaresGameIds.has(game.id);
        return isCreator || hasPurchased;
      })
      .sort((a: SquaresGame, b: SquaresGame) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allSquaresGames, user?.userId, myPurchasedSquaresGameIds]);

  const joinableSquaresGames = useMemo((): SquaresGame[] => {
    if (!user?.userId) return [];
    const games: SquaresGame[] = Array.from(allSquaresGames.values());
    return games
      .filter((game: SquaresGame) => {
        if (game.status !== 'ACTIVE') return false;
        if (game.creatorId === user.userId) return false;
        if (myPurchasedSquaresGameIds.has(game.id)) return false;
        if (game.isPrivate && !invitedSquaresGameIds.has(game.id)) return false;
        return true;
      })
      .sort((a: SquaresGame, b: SquaresGame) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [allSquaresGames, user?.userId, myPurchasedSquaresGameIds, invitedSquaresGameIds]);

  const joinableFriendsSquaresGames = useMemo(() => {
    return joinableSquaresGames.filter(game => friendIds.has(game.creatorId));
  }, [joinableSquaresGames, friendIds]);

  const betInvitations = useMemo((): BetInvitation[] => {
    const invitations: BetInvitation[] = Array.from(betInvitationsMap.values());
    return invitations
      .sort((a: BetInvitation, b: BetInvitation) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [betInvitationsMap]);

  const squaresInvitations = useMemo((): SquaresInvitation[] => {
    const invitations: SquaresInvitation[] = Array.from(squaresInvitationsMap.values());
    return invitations
      .sort((a: SquaresInvitation, b: SquaresInvitation) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [squaresInvitationsMap]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    await loadAllData(true);
  }, [loadAllData]);

  const joinBet = useCallback(async (bet: Bet, side: 'A' | 'B', amount: number): Promise<boolean> => {
    if (!user?.userId) return false;

    // Optimistic update: move bet from joinable → myBets
    const updatedBet: Bet = {
      ...bet,
      sideACount: (bet.sideACount || 0) + (side === 'A' ? 1 : 0),
      sideBCount: (bet.sideBCount || 0) + (side === 'B' ? 1 : 0),
      participantUserIds: [...(bet.participantUserIds || []), user.userId],
      totalPot: (bet.totalPot || 0) + amount,
    };

    setAllBets(prev => {
      const updated = new Map(prev);
      updated.set(bet.id, updatedBet);
      return updated;
    });

    try {
      // Server-side: check for existing participation
      const { data: existingParticipants } = await client.models.Participant.list({
        filter: { betId: { eq: bet.id }, userId: { eq: user.userId } }
      });

      if (existingParticipants && existingParticipants.length > 0) {
        showAlert('Already Joined', 'You have already joined this bet.');
        return true; // Already joined, not an error
      }

      // Check balance
      const { data: userData } = await client.models.User.get({ id: user.userId });
      const currentBalance = userData?.balance || 0;

      if (currentBalance < amount) {
        // Rollback optimistic update
        setAllBets(prev => {
          const updated = new Map(prev);
          updated.set(bet.id, bet);
          return updated;
        });
        showAlert(
          'Insufficient Balance',
          `You need $${amount} to join this bet, but your current balance is $${currentBalance.toFixed(2)}.`
        );
        return false;
      }

      // Create participant
      const result = await client.models.Participant.create({
        betId: bet.id,
        userId: user.userId,
        side: side,
        amount: amount,
        status: 'ACCEPTED',
        payout: 0,
      });

      if (!result.data) throw new Error('Failed to create participant');

      const participantId = result.data.id || '';
      const sideName = side === 'A' ? (bet.odds.sideAName || 'Side A') : (bet.odds.sideBName || 'Side B');

      // Record transaction
      const transaction = await TransactionService.recordBetPlacement(
        user.userId,
        amount,
        bet.id,
        participantId,
        bet.title,
        sideName
      );

      if (!transaction) {
        await client.models.Participant.delete({ id: participantId });
        throw new Error('Failed to record transaction');
      }

      // Update bet record (denormalized counts + pot)
      await client.models.Bet.update({
        id: bet.id,
        totalPot: (bet.totalPot || 0) + amount,
        sideACount: (bet.sideACount || 0) + (side === 'A' ? 1 : 0),
        sideBCount: (bet.sideBCount || 0) + (side === 'B' ? 1 : 0),
        participantUserIds: [...(bet.participantUserIds || []), user.userId],
        updatedAt: new Date().toISOString(),
      });

      // Notify creator
      if (bet.creatorId !== user.userId) {
        try {
          const { data: joinedUserData } = await client.models.User.get({ id: user.userId });
          if (joinedUserData) {
            await NotificationService.createNotification({
              userId: bet.creatorId,
              type: 'BET_JOINED',
              title: 'Someone Joined Your Bet!',
              message: `${joinedUserData.displayName || joinedUserData.username} joined "${bet.title}" with $${amount}`,
              priority: 'HIGH',
              actionType: 'view_bet',
              actionData: { betId: bet.id },
              relatedBetId: bet.id,
              relatedUserId: user.userId,
              sendPush: true,
            });
          }
        } catch (notificationError) {
          console.warn('Failed to send bet joined notification:', notificationError);
        }
      }

      showAlert(
        'Joined Successfully!',
        `You've joined the bet with $${amount}. Your new balance is $${(currentBalance - amount).toFixed(2)}.`
      );

      return true;
    } catch (error) {
      console.error('Error joining bet:', error);
      // Rollback optimistic update
      setAllBets(prev => {
        const updated = new Map(prev);
        updated.set(bet.id, bet);
        return updated;
      });
      showAlert('Error', 'Failed to join bet. Please try again.');
      return false;
    }
  }, [user?.userId]);

  const acceptBetInvitationAction = useCallback(async (invitation: BetInvitation, selectedSide: string): Promise<boolean> => {
    if (!user?.userId || !invitation.bet) return false;

    const betAmount = invitation.bet.betAmount || 0;

    try {
      // Check bet is still active
      const { data: currentBet } = await client.models.Bet.get({ id: invitation.betId });
      if (!currentBet || currentBet.status !== 'ACTIVE') {
        showAlert('Bet Not Available', 'This bet is no longer available to join.');
        setBetInvitationsMap(prev => {
          const updated = new Map(prev);
          updated.delete(invitation.id);
          return updated;
        });
        return false;
      }

      // Check balance
      const { data: currentUser } = await client.models.User.get({ id: user.userId });
      const currentBalance = currentUser?.balance || 0;

      if (currentBalance < betAmount) {
        showAlert(
          'Insufficient Balance',
          `You need $${betAmount.toFixed(2)} to join this bet, but you only have $${currentBalance.toFixed(2)}.`
        );
        return false;
      }

      // Update invitation status
      await client.models.BetInvitation.update({
        id: invitation.id,
        status: 'ACCEPTED',
      });

      // Notify inviter
      try {
        const { data: accepterData } = await client.models.User.get({ id: user.userId });
        if (accepterData && invitation.fromUserId !== user.userId) {
          await NotificationService.createNotification({
            userId: invitation.fromUserId,
            type: 'BET_INVITATION_ACCEPTED',
            title: 'Bet Invitation Accepted',
            message: `${accepterData.displayName || accepterData.username} accepted your bet invitation for "${invitation.bet?.title}"`,
            priority: 'MEDIUM',
            actionType: 'view_bet',
            actionData: { betId: invitation.betId },
            relatedBetId: invitation.betId,
            relatedUserId: user.userId,
            relatedRequestId: invitation.id,
            sendPush: true,
          });
        }
      } catch (notificationError) {
        console.warn('Failed to send bet invitation accepted notification:', notificationError);
      }

      // Create participant
      const participantResult = await client.models.Participant.create({
        betId: invitation.betId,
        userId: user.userId,
        side: selectedSide,
        amount: betAmount,
        status: 'ACCEPTED',
        payout: 0,
        joinedAt: new Date().toISOString(),
      });

      if (!participantResult.data) throw new Error('Failed to create participant record');

      // Record transaction
      const participantId = participantResult.data.id || '';
      const betOdds = currentBet.odds ? (typeof currentBet.odds === 'string' ? JSON.parse(currentBet.odds) : currentBet.odds) : { sideAName: 'Side A', sideBName: 'Side B' };
      const joinedSideName = selectedSide === 'A' ? (betOdds.sideAName || 'Side A') : (betOdds.sideBName || 'Side B');

      const transaction = await TransactionService.recordBetPlacement(
        user.userId,
        betAmount,
        invitation.betId,
        participantId,
        currentBet.title || 'Bet',
        joinedSideName
      );

      if (!transaction) {
        await client.models.Participant.delete({ id: participantId });
        throw new Error('Failed to record transaction');
      }

      // Update bet denormalized counts
      await client.models.Bet.update({
        id: invitation.betId,
        totalPot: (currentBet.totalPot || 0) + betAmount,
        sideACount: (currentBet.sideACount || 0) + (selectedSide === 'A' ? 1 : 0),
        sideBCount: (currentBet.sideBCount || 0) + (selectedSide === 'B' ? 1 : 0),
        participantUserIds: [...(currentBet.participantUserIds || []), user.userId],
      });

      // Optimistic removal of invitation from local state
      setBetInvitationsMap(prev => {
        const updated = new Map(prev);
        updated.delete(invitation.id);
        return updated;
      });

      return true;
    } catch (error) {
      console.error('Error accepting bet invitation:', error);
      showAlert('Error', 'Failed to accept invitation. Please try again.');
      return false;
    }
  }, [user?.userId]);

  const declineBetInvitationAction = useCallback(async (invitation: BetInvitation): Promise<void> => {
    if (!user?.userId) return;

    try {
      await client.models.BetInvitation.update({
        id: invitation.id,
        status: 'DECLINED',
      });

      // Notify inviter
      try {
        const { data: declinerData } = await client.models.User.get({ id: user.userId });
        if (declinerData && invitation.fromUserId !== user.userId) {
          await NotificationService.createNotification({
            userId: invitation.fromUserId,
            type: 'BET_INVITATION_DECLINED',
            title: 'Bet Invitation Declined',
            message: `${declinerData.displayName || declinerData.username} declined your bet invitation for "${invitation.bet?.title}"`,
            priority: 'LOW',
            actionType: 'view_bet',
            actionData: { betId: invitation.betId },
            relatedBetId: invitation.betId,
            relatedUserId: user.userId,
            relatedRequestId: invitation.id,
            sendPush: false,
          });
        }
      } catch (notificationError) {
        console.warn('Failed to send bet invitation declined notification:', notificationError);
      }

      // Remove from local state
      setBetInvitationsMap(prev => {
        const updated = new Map(prev);
        updated.delete(invitation.id);
        return updated;
      });

      showAlert('Declined', 'Bet invitation declined.');
    } catch (error) {
      console.error('Error declining bet invitation:', error);
      showAlert('Error', 'Failed to decline invitation. Please try again.');
    }
  }, [user?.userId]);

  const declineSquaresInvitationAction = useCallback(async (invitation: SquaresInvitation): Promise<void> => {
    if (!user?.userId) return;

    try {
      await client.models.SquaresInvitation.update({
        id: invitation.id,
        status: 'DECLINED',
        updatedAt: new Date().toISOString(),
      });

      // Notify the inviter
      try {
        const { data: declinerData } = await client.models.User.get({ id: user.userId });
        if (declinerData && invitation.fromUserId !== user.userId) {
          await NotificationService.createNotification({
            userId: invitation.fromUserId,
            type: 'SQUARES_INVITATION_DECLINED',
            title: 'Squares Invitation Declined',
            message: `${declinerData.displayName || declinerData.username} declined your squares game invitation`,
            priority: 'LOW',
            actionData: { squaresGameId: invitation.squaresGameId },
            relatedUserId: user.userId,
            sendPush: false,
          });
        }
      } catch (notificationError) {
        console.warn('Failed to send squares invitation declined notification:', notificationError);
      }

      // Remove from local state
      setSquaresInvitationsMap(prev => {
        const updated = new Map(prev);
        updated.delete(invitation.id);
        return updated;
      });

      showAlert('Declined', 'Squares invitation declined.');
    } catch (error) {
      console.error('Error declining squares invitation:', error);
      showAlert('Error', 'Failed to decline invitation. Please try again.');
    }
  }, [user?.userId]);

  const dismissSquaresInvitationByGameAction = useCallback((squaresGameId: string) => {
    setSquaresInvitationsMap(prev => {
      const updated = new Map(prev);
      for (const [id, inv] of updated) {
        if (inv.squaresGameId === squaresGameId) {
          updated.delete(id);
        }
      }
      return updated;
    });
  }, []);

  // ─── Context value ───────────────────────────────────────────────────────

  const value = useMemo<BetDataContextValue>(() => ({
    myBets,
    joinableBets,
    joinableFriendsBets,
    mySquaresGames,
    joinableSquaresGames,
    joinableFriendsSquaresGames,
    betInvitations,
    squaresInvitations,
    isInitialLoading,
    isRefreshing,
    refresh,
    joinBet,
    acceptBetInvitation: acceptBetInvitationAction,
    declineBetInvitation: declineBetInvitationAction,
    declineSquaresInvitation: declineSquaresInvitationAction,
    dismissSquaresInvitationByGame: dismissSquaresInvitationByGameAction,
  }), [
    myBets,
    joinableBets,
    joinableFriendsBets,
    mySquaresGames,
    joinableSquaresGames,
    joinableFriendsSquaresGames,
    betInvitations,
    squaresInvitations,
    isInitialLoading,
    isRefreshing,
    refresh,
    joinBet,
    acceptBetInvitationAction,
    declineBetInvitationAction,
    declineSquaresInvitationAction,
    dismissSquaresInvitationByGameAction,
  ]);

  return (
    <BetDataContext.Provider value={value}>
      {children}
    </BetDataContext.Provider>
  );
};

// ─── Hook ──────────────────────────────────────────────────────────────────

export const useBetData = (): BetDataContextValue => {
  const context = useContext(BetDataContext);
  if (!context) {
    throw new Error('useBetData must be used within a BetDataProvider');
  }
  return context;
};
