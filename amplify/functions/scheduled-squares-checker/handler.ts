import { EventBridgeHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/scheduled-squares-checker';

// CRITICAL: Top-level await configuration - required for proper client initialization
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

/**
 * Scheduled Squares Checker Lambda Function
 *
 * Runs every 5 minutes to manage squares game lifecycle and automatic payouts:
 * 1. Lock grids (ACTIVE → LOCKED) when 100 squares sold or game start time reached
 * 2. Start games (LOCKED → LIVE) when event goes live
 * 3. Process period scores and create payouts (LIVE)
 * 4. Resolve games (LIVE → RESOLVED) when all periods paid
 * 5. Cancel games if event is cancelled/postponed
 */
export const handler: EventBridgeHandler<"Scheduled Event", null, boolean> = async (event) => {
  console.log('🎲 Scheduled Squares Checker triggered:', JSON.stringify(event, null, 2));

  try {
    let totalActions = 0;

    // ============ STEP 1: LOCK GRIDS (ACTIVE → LOCKED) ============
    console.log('\n📍 STEP 1: Checking for grids to lock...');
    const lockedCount = await lockGridsReadyForLocking();
    totalActions += lockedCount;

    // ============ STEP 2: START GAMES (LOCKED → LIVE) ============
    console.log('\n🎮 STEP 2: Checking for games to start...');
    const startedCount = await startGamesWhenEventLive();
    totalActions += startedCount;

    // ============ STEP 3: PROCESS PERIOD SCORES (LIVE) ============
    console.log('\n🏆 STEP 3: Processing period scores for live games...');
    const payoutsCount = await processPeriodScoresForLiveGames();
    totalActions += payoutsCount;

    // ============ STEP 4: RESOLVE GAMES (LIVE → RESOLVED) ============
    console.log('\n✅ STEP 4: Checking for games to resolve...');
    const resolvedCount = await resolveCompletedGames();
    totalActions += resolvedCount;

    // ============ STEP 5: CANCEL GAMES (EVENT CANCELLED) ============
    console.log('\n❌ STEP 5: Checking for cancelled events...');
    const cancelledCount = await cancelGamesForCancelledEvents();
    totalActions += cancelledCount;

    console.log(`\n✅ Scheduled Squares Checker completed. Total actions: ${totalActions}`);
    return true;

  } catch (error) {
    console.error('❌ Scheduled Squares Checker failed:', error);
    return false;
  }
};

/**
 * STEP 1: Lock grids and assign numbers
 * Conditions: ACTIVE status AND (squaresSold >= 100 OR locksAt <= now)
 */
async function lockGridsReadyForLocking(): Promise<number> {
  try {
    // Query ACTIVE games
    const { data: activeGames } = await client.models.SquaresGame.squaresGamesByStatus({
      status: 'ACTIVE'
    });

    if (!activeGames || activeGames.length === 0) {
      console.log('No ACTIVE games found');
      return 0;
    }

    console.log(`Found ${activeGames.length} ACTIVE games`);

    const now = new Date();
    let lockedCount = 0;

    for (const game of activeGames) {
      // Check if should lock (100 squares OR past lock time)
      const shouldLock = game.squaresSold >= 100 || new Date(game.locksAt) <= now;

      if (!shouldLock) continue;

      // If no squares were sold, cancel the game instead of locking
      if (game.squaresSold === 0) {
        console.log(`❌ Cancelling game ${game.id} - no squares purchased`);

        await client.models.SquaresGame.update({
          id: game.id,
          status: 'CANCELLED',
          resolutionReason: 'No squares purchased',
          updatedAt: new Date().toISOString(),
        });

        // Notify creator
        await client.models.Notification.create({
          userId: game.creatorId,
          type: 'SQUARES_GAME_CANCELLED',
          title: 'Game Cancelled',
          message: `"${game.title}" was cancelled because no squares were purchased.`,
          priority: 'MEDIUM',
          actionData: JSON.stringify({ squaresGameId: game.id }),
          isRead: false,
          createdAt: new Date().toISOString(),
        });

        console.log(`✅ Cancelled game ${game.id}, notified creator`);
        lockedCount++; // Count as an action taken
        continue;
      }

      console.log(`🔒 Locking grid for game: ${game.id} (${game.squaresSold}/100 squares)`);

      // Generate random numbers
      const rowNumbers = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const colNumbers = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      // Update game
      await client.models.SquaresGame.update({
        id: game.id,
        rowNumbers,
        colNumbers,
        numbersAssigned: true,
        status: 'LOCKED',
        updatedAt: new Date().toISOString(),
      });

      // Get all buyers (unique userIds)
      const { data: purchases } = await client.models.SquaresPurchase.purchasesBySquaresGame({
        squaresGameId: game.id
      });

      const buyerIds = new Set(purchases?.map((p: any) => p.userId) || []);

      // Send notifications to all buyers
      for (const buyerId of buyerIds) {
        await client.models.Notification.create({
          userId: buyerId,
          type: 'SQUARES_GRID_LOCKED',
          title: 'Numbers Assigned!',
          message: `Grid is locked for "${game.title}". Numbers have been assigned. Good luck!`,
          priority: 'HIGH',
          actionData: JSON.stringify({ squaresGameId: game.id }),
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      console.log(`✅ Locked grid ${game.id}, notified ${buyerIds.size} buyers`);
      lockedCount++;
    }

    return lockedCount;
  } catch (error) {
    console.error('Error in lockGridsReadyForLocking:', error);
    return 0;
  }
}

/**
 * STEP 2: Start games when event goes live
 * Conditions: LOCKED status AND (event.status = LIVE OR event time has passed)
 */
async function startGamesWhenEventLive(): Promise<number> {
  try {
    // Query LOCKED games
    const { data: lockedGames } = await client.models.SquaresGame.squaresGamesByStatus({
      status: 'LOCKED'
    });

    if (!lockedGames || lockedGames.length === 0) {
      console.log('No LOCKED games found');
      return 0;
    }

    console.log(`Found ${lockedGames.length} LOCKED games`);

    const now = new Date();
    let startedCount = 0;

    for (const game of lockedGames) {
      // Get event
      const { data: event } = await client.models.LiveEvent.get({ id: game.eventId });

      if (!event) {
        console.log(`⚠️  Event ${game.eventId} not found for game ${game.id} - cancelling game`);
        await client.models.SquaresGame.update({
          id: game.id,
          status: 'CANCELLED',
          resolutionReason: 'Event not found',
          updatedAt: new Date().toISOString(),
        });
        continue;
      }

      // Check if event is LIVE
      const isEventLive = event.status === 'LIVE';

      // FALLBACK: If event time has passed by more than 2 hours, start the game anyway
      const eventTime = new Date(event.scheduledTime);
      const hoursSinceEventTime = (now.getTime() - eventTime.getTime()) / (1000 * 60 * 60);
      const shouldStartByTime = hoursSinceEventTime >= 2;

      if (isEventLive || shouldStartByTime) {
        console.log(`🎮 Starting game: ${game.id} (${isEventLive ? 'event is LIVE' : `${hoursSinceEventTime.toFixed(1)}h since event time`})`);

        // Update game status
        await client.models.SquaresGame.update({
          id: game.id,
          status: 'LIVE',
          updatedAt: new Date().toISOString(),
        });

        // Get all buyers
        const { data: purchases } = await client.models.SquaresPurchase.purchasesBySquaresGame({
          squaresGameId: game.id
        });

        const buyerIds = new Set(purchases?.map((p: any) => p.userId) || []);

        // Send notifications
        for (const buyerId of buyerIds) {
          await client.models.Notification.create({
            userId: buyerId,
            type: 'SQUARES_GAME_LIVE',
            title: 'Game is LIVE!',
            message: `"${game.title}" has started. Watch the scores!`,
            priority: 'HIGH',
            actionData: JSON.stringify({ squaresGameId: game.id }),
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }

        console.log(`✅ Started game ${game.id}, notified ${buyerIds.size} buyers`);
        startedCount++;
      }
    }

    return startedCount;
  } catch (error) {
    console.error('Error in startGamesWhenEventLive:', error);
    return 0;
  }
}

/**
 * STEP 3: Process period scores and create payouts
 * Conditions: LIVE status AND event has period scores
 */
async function processPeriodScoresForLiveGames(): Promise<number> {
  try {
    // Query LIVE games
    const { data: liveGames } = await client.models.SquaresGame.squaresGamesByStatus({
      status: 'LIVE'
    });

    if (!liveGames || liveGames.length === 0) {
      console.log('No LIVE games found');
      return 0;
    }

    console.log(`Found ${liveGames.length} LIVE games`);

    let payoutsCreated = 0;

    for (const game of liveGames) {
      // Get event
      const { data: event } = await client.models.LiveEvent.get({ id: game.eventId });

      if (!event) {
        console.log(`Event ${game.eventId} not found for game ${game.id}`);
        continue;
      }

      // Check if event has period scores
      if (!event.homePeriodScores || !event.awayPeriodScores) {
        console.log(`Event ${event.id} has no period scores yet`);
        continue;
      }

      const homePeriodScores = event.homePeriodScores as number[];
      const awayPeriodScores = event.awayPeriodScores as number[];

      // Get existing payouts to avoid duplicates
      const { data: existingPayouts } = await client.models.SquaresPayout.payoutsBySquaresGame({
        squaresGameId: game.id
      });

      const paidPeriods = new Set(existingPayouts?.map((p: any) => p.period) || []);

      // Process each period (1-4)
      for (let period = 1; period <= 4; period++) {
        const periodEnum = `PERIOD_${period}` as 'PERIOD_1' | 'PERIOD_2' | 'PERIOD_3' | 'PERIOD_4';

        // Skip if already paid
        if (paidPeriods.has(periodEnum)) continue;

        // Check if period score is available
        const periodIndex = period - 1;
        if (periodIndex >= homePeriodScores.length || periodIndex >= awayPeriodScores.length) {
          console.log(`Period ${period} scores not available yet for game ${game.id}`);
          continue;
        }

        const homeScore = homePeriodScores[periodIndex];
        const awayScore = awayPeriodScores[periodIndex];

        console.log(`🏆 Processing Period ${period} for game ${game.id}: ${awayScore}-${homeScore}`);

        // Get all purchases
        const { data: purchases } = await client.models.SquaresPurchase.purchasesBySquaresGame({
          squaresGameId: game.id
        });

        if (!purchases || purchases.length === 0) {
          console.log(`No purchases found for game ${game.id}`);
          continue;
        }

        // Find winner
        const winningPurchase = findWinningSquare(game, purchases, homeScore, awayScore);

        if (!winningPurchase) {
          console.log(`No owner for winning square - house wins Period ${period}`);

          // Create house win payout record for tracking
          const now = new Date().toISOString();
          await client.models.SquaresPayout.create({
            squaresGameId: game.id,
            squaresPurchaseId: null, // No purchase for unsold square
            userId: game.creatorId, // Track under creator for notification purposes
            ownerName: 'HOUSE',
            period: periodEnum,
            amount: 0, // No payout to anyone
            homeScore: homeScore % 10,
            awayScore: awayScore % 10,
            homeScoreFull: homeScore,
            awayScoreFull: awayScore,
            status: 'COMPLETED', // Mark as completed so resolution counts it
            createdAt: now,
            paidAt: now,
          });

          // Notify creator that house won this period
          await client.models.Notification.create({
            userId: game.creatorId,
            type: 'SQUARES_PERIOD_WINNER',
            title: 'Unsold Square Won',
            message: `Period ${period} in "${game.title}" won by unsold square (${awayScore % 10}-${homeScore % 10}). No payout issued.`,
            priority: 'MEDIUM',
            actionData: JSON.stringify({ squaresGameId: game.id }),
            isRead: false,
            createdAt: now,
          });

          console.log(`✅ Recorded house win for Period ${period}, notified creator`);
          payoutsCreated++;
          continue;
        }

        // Calculate payout
        const payoutAmount = calculatePayout(period, game.totalPot, game.payoutStructure);

        // Create payout record
        const now = new Date().toISOString();
        const { data: payout } = await client.models.SquaresPayout.create({
          squaresGameId: game.id,
          squaresPurchaseId: winningPurchase.id,
          userId: winningPurchase.userId,
          ownerName: winningPurchase.ownerName,
          period: periodEnum,
          amount: payoutAmount,
          homeScore: homeScore % 10,
          awayScore: awayScore % 10,
          homeScoreFull: homeScore,
          awayScoreFull: awayScore,
          status: 'COMPLETED',
          createdAt: now,
          paidAt: now,
        });

        if (!payout) {
          console.error(`Failed to create payout for Period ${period}`);
          continue;
        }

        // Credit buyer's account
        const { data: user } = await client.models.User.get({ id: winningPurchase.userId });
        if (user) {
          const newBalance = user.balance + payoutAmount;
          await client.models.User.update({
            id: winningPurchase.userId,
            balance: newBalance,
          });

          // Create transaction record
          await client.models.Transaction.create({
            userId: winningPurchase.userId,
            type: 'SQUARES_PAYOUT',
            status: 'COMPLETED',
            amount: payoutAmount,
            platformFee: 0, // Already deducted
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            relatedSquaresGameId: game.id,
            notes: `${periodEnum} winner payout`,
            createdAt: now,
            completedAt: now,
          });
        }

        // Send notification to buyer
        const { data: buyer } = await client.models.User.get({ id: winningPurchase.userId });
        const isSelfOwned = winningPurchase.ownerName === buyer?.displayName;

        const notificationMessage = isSelfOwned
          ? `You won Period ${period}! $${payoutAmount.toFixed(2)}`
          : `Square for "${winningPurchase.ownerName}" won Period ${period}! You received $${payoutAmount.toFixed(2)}`;

        await client.models.Notification.create({
          userId: winningPurchase.userId,
          type: 'SQUARES_PERIOD_WINNER',
          title: '🎉 Winner!',
          message: notificationMessage,
          priority: 'HIGH',
          actionData: JSON.stringify({ squaresGameId: game.id, payoutId: payout.id }),
          isRead: false,
          createdAt: now,
        });

        console.log(`✅ Paid Period ${period} winner: ${winningPurchase.ownerName} - $${payoutAmount}`);
        payoutsCreated++;
      }
    }

    return payoutsCreated;
  } catch (error) {
    console.error('Error in processPeriodScoresForLiveGames:', error);
    return 0;
  }
}

/**
 * STEP 4: Resolve games when all periods are paid
 * Conditions: LIVE status AND (event.status = FINISHED OR game is old)
 */
async function resolveCompletedGames(): Promise<number> {
  try {
    // Query LIVE games
    const { data: liveGames } = await client.models.SquaresGame.squaresGamesByStatus({
      status: 'LIVE'
    });

    if (!liveGames || liveGames.length === 0) {
      console.log('No LIVE games to resolve');
      return 0;
    }

    console.log(`Found ${liveGames.length} LIVE games`);

    const now = new Date();
    let resolvedCount = 0;

    for (const game of liveGames) {
      // Get event
      const { data: event } = await client.models.LiveEvent.get({ id: game.eventId });

      // FALLBACK: If event doesn't exist or game is old, mark as PENDING_RESOLUTION
      if (!event) {
        console.log(`⚠️  Event ${game.eventId} not found for game ${game.id} - marking PENDING_RESOLUTION`);
        await client.models.SquaresGame.update({
          id: game.id,
          status: 'PENDING_RESOLUTION',
          resolutionReason: 'Event not found',
          updatedAt: now.toISOString(),
        });
        continue;
      }

      // FALLBACK: If game has been LIVE for more than 2 days, force resolution
      const daysSinceLocked = (now.getTime() - new Date(game.locksAt).getTime()) / (1000 * 60 * 60 * 24);
      const isOldGame = daysSinceLocked > 2;

      // Check if event is FINISHED or game is old
      const isEventFinished = event.status === 'FINISHED';

      if (isEventFinished || isOldGame) {
        // Count payouts
        const { data: payouts } = await client.models.SquaresPayout.payoutsBySquaresGame({
          squaresGameId: game.id
        });

        const payoutCount = payouts?.length || 0;

        if (payoutCount === 4) {
          // All 4 periods paid - resolve game
          console.log(`✅ Resolving game ${game.id} (all 4 periods paid)`);

          await client.models.SquaresGame.update({
            id: game.id,
            status: 'RESOLVED',
            updatedAt: now.toISOString(),
          });

          resolvedCount++;
        } else {
          // Missing period data
          console.log(`⚠️  Game ${game.id} missing period data (${payoutCount}/4 periods) - ${isOldGame ? 'old game' : 'event finished'}`);

          await client.models.SquaresGame.update({
            id: game.id,
            status: 'PENDING_RESOLUTION',
            resolutionReason: `Missing period score data (${payoutCount}/4 periods)`,
            updatedAt: now.toISOString(),
          });

          resolvedCount++;
        }
      }
    }

    return resolvedCount;
  } catch (error) {
    console.error('Error in resolveCompletedGames:', error);
    return 0;
  }
}

/**
 * STEP 5: Cancel games if event is cancelled/postponed
 * Conditions: ACTIVE or LOCKED status AND event.status = CANCELLED or POSTPONED
 */
async function cancelGamesForCancelledEvents(): Promise<number> {
  try {
    // Query ACTIVE and LOCKED games
    const { data: activeGames } = await client.models.SquaresGame.squaresGamesByStatus({
      status: 'ACTIVE'
    });
    const { data: lockedGames } = await client.models.SquaresGame.squaresGamesByStatus({
      status: 'LOCKED'
    });

    const gamesToCheck = [...(activeGames || []), ...(lockedGames || [])];

    if (gamesToCheck.length === 0) {
      console.log('No games to check for cancellation');
      return 0;
    }

    console.log(`Checking ${gamesToCheck.length} games for cancelled events`);

    let cancelledCount = 0;

    for (const game of gamesToCheck) {
      // Get event
      const { data: event } = await client.models.LiveEvent.get({ id: game.eventId });

      if (!event) continue;

      // Check if event is cancelled or postponed
      if (event.status !== 'CANCELLED' && event.status !== 'POSTPONED') continue;

      console.log(`❌ Cancelling game ${game.id} (event ${event.status})`);

      // Get all purchases
      const { data: purchases } = await client.models.SquaresPurchase.purchasesBySquaresGame({
        squaresGameId: game.id
      });

      if (!purchases || purchases.length === 0) {
        // No purchases to refund
        await client.models.SquaresGame.update({
          id: game.id,
          status: 'CANCELLED',
          resolutionReason: `Event ${event.status}`,
          updatedAt: new Date().toISOString(),
        });
        continue;
      }

      // Refund each buyer
      const refundMap = new Map<string, number>();

      for (const purchase of purchases) {
        const currentRefund = refundMap.get(purchase.userId) || 0;
        refundMap.set(purchase.userId, currentRefund + purchase.amount);
      }

      // Process refunds
      const now = new Date().toISOString();
      for (const [userId, amount] of refundMap.entries()) {
        const { data: user } = await client.models.User.get({ id: userId });
        if (user) {
          const newBalance = user.balance + amount;
          await client.models.User.update({
            id: userId,
            balance: newBalance,
          });

          // Create transaction
          await client.models.Transaction.create({
            userId,
            type: 'SQUARES_REFUND',
            status: 'COMPLETED',
            amount: amount,
            platformFee: 0,
            balanceBefore: user.balance,
            balanceAfter: newBalance,
            relatedSquaresGameId: game.id,
            notes: 'Game cancelled - refund',
            createdAt: now,
            completedAt: now,
          });

          // Send notification
          await client.models.Notification.create({
            userId,
            type: 'SQUARES_GAME_CANCELLED',
            title: 'Game Cancelled',
            message: `"${game.title}" was cancelled. You received a $${amount.toFixed(2)} refund.`,
            priority: 'MEDIUM',
            actionData: JSON.stringify({ squaresGameId: game.id }),
            isRead: false,
            createdAt: now,
          });
        }
      }

      // Update game status
      await client.models.SquaresGame.update({
        id: game.id,
        status: 'CANCELLED',
        resolutionReason: `Event ${event.status}`,
        updatedAt: new Date().toISOString(),
      });

      console.log(`✅ Cancelled game ${game.id}, refunded ${refundMap.size} buyers`);
      cancelledCount++;
    }

    return cancelledCount;
  } catch (error) {
    console.error('Error in cancelGamesForCancelledEvents:', error);
    return 0;
  }
}

// ============ HELPER FUNCTIONS ============

/**
 * Find winning square based on period scores
 */
function findWinningSquare(game: any, purchases: any[], homeScore: number, awayScore: number): any | null {
  if (!game.numbersAssigned || !game.rowNumbers || !game.colNumbers) {
    return null;
  }

  // Get last digit of each score
  const homeDigit = homeScore % 10;
  const awayDigit = awayScore % 10;

  // Find column index where colNumbers[col] === awayDigit
  const col = game.colNumbers.indexOf(awayDigit);

  // Find row index where rowNumbers[row] === homeDigit
  const row = game.rowNumbers.indexOf(homeDigit);

  if (col === -1 || row === -1) {
    return null;
  }

  // Find purchase at (row, col)
  return purchases.find(p => p.gridRow === row && p.gridCol === col) || null;
}

/**
 * Calculate payout for a period
 */
function calculatePayout(period: number, totalPot: number, payoutStructure: any): number {
  const percentages = [
    payoutStructure.period1, // Period 1
    payoutStructure.period2, // Period 2 (halftime)
    payoutStructure.period3, // Period 3
    payoutStructure.period4, // Period 4 (final)
  ];

  const percentage = percentages[period - 1];
  const grossPayout = totalPot * percentage;

  // Apply 3% platform fee
  const platformFee = grossPayout * 0.03;
  const netPayout = grossPayout - platformFee;

  return Math.round(netPayout * 100) / 100;
}

/**
 * Shuffle array (Fisher-Yates algorithm)
 */
function shuffleArray(array: number[]): number[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
