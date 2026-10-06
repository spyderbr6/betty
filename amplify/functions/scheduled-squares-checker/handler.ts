import { EventBridgeHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/scheduled-squares-checker';
import { notificationMeta } from '../../shared/notificationCatalog';
import { ledgerApply } from '../../shared/moneyClient';
import { isProActive } from '../../../src/config/subscriptionConfig';
import {
  calculatePayout,
  FINAL_PERIOD,
  periodsToSettle,
  settledPeriodCount,
  cancelSquaresGame,
  periodPayoutEntry,
  potFromPurchases,
  squaresPayoutRecordId,
  type SquaresPeriod,
} from '../../shared/squaresMoney';

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
    const activeGames = await gamesByStatus('ACTIVE');

    if (activeGames.length === 0) {
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

      // If no squares were sold, cancel the game instead of locking. squaresSold is a
      // count buyers' phones keep, so any purchases that do exist are refunded.
      if (game.squaresSold === 0) {
        console.log(`❌ Cancelling game ${game.id} - no squares purchased`);

        if (!(await cancelGame(game, 'No squares purchased'))) continue;

        // Notify creator
        await client.models.Notification.create({
          userId: game.creatorId,
          type: 'SQUARES_GAME_CANCELLED',
          ...notificationMeta('SQUARES_GAME_CANCELLED'),
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
          ...notificationMeta('SQUARES_GRID_LOCKED'),
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
    const lockedGames = await gamesByStatus('LOCKED');

    if (lockedGames.length === 0) {
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
        // A LOCKED game has buyers; this used to cancel it and refund none of them
        console.log(`⚠️  Event ${game.eventId} not found for game ${game.id} - cancelling game`);
        await cancelGame(game, 'Event not found');
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
            ...notificationMeta('SQUARES_GAME_LIVE'),
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
    const liveGames = await gamesByStatus('LIVE');

    if (liveGames.length === 0) {
      console.log('No LIVE games found');
      return 0;
    }

    console.log(`Found ${liveGames.length} LIVE games`);

    let payoutsCreated = 0;

    for (const game of liveGames) {
      console.log(`\n🎲 Processing LIVE game: ${game.id} - "${game.title}"`);

      // CRITICAL: Re-fetch full game data to ensure all fields are loaded
      // Secondary index queries may not return all fields (especially a.json() fields)
      const { data: fullGame } = await client.models.SquaresGame.get({ id: game.id });

      if (!fullGame) {
        console.log(`Failed to fetch full game data for ${game.id}`);
        continue;
      }

      console.log(`   Total pot: $${fullGame.totalPot}`);
      console.log(`   Payout structure type: ${typeof fullGame.payoutStructure}`);
      console.log(`   Payout structure value:`, fullGame.payoutStructure);

      // Get event
      const { data: event } = await client.models.LiveEvent.get({ id: fullGame.eventId });

      if (!event) {
        console.log(`Event ${fullGame.eventId} not found for game ${fullGame.id}`);
        continue;
      }

      // Debug logging: Check what we actually received
      console.log(`📊 Event ${event.id} data check:`);
      console.log(`   homePeriodScores type: ${typeof event.homePeriodScores}`);
      console.log(`   homePeriodScores value:`, event.homePeriodScores);
      console.log(`   awayPeriodScores type: ${typeof event.awayPeriodScores}`);
      console.log(`   awayPeriodScores value:`, event.awayPeriodScores);
      console.log(`   isArray home: ${Array.isArray(event.homePeriodScores)}`);
      console.log(`   isArray away: ${Array.isArray(event.awayPeriodScores)}`);

      // Check if event has period scores
      if (!event.homePeriodScores || !event.awayPeriodScores) {
        console.log(`Event ${event.id} has no period scores yet`);
        continue;
      }

      // Parse JSON strings to arrays (a.json() fields store data as JSON strings)
      let homePeriodScores: number[];
      let awayPeriodScores: number[];

      try {
        homePeriodScores = typeof event.homePeriodScores === 'string'
          ? JSON.parse(event.homePeriodScores) as number[]
          : event.homePeriodScores as number[];
        awayPeriodScores = typeof event.awayPeriodScores === 'string'
          ? JSON.parse(event.awayPeriodScores) as number[]
          : event.awayPeriodScores as number[];

        // Validate that scores are arrays
        if (!Array.isArray(homePeriodScores) || !Array.isArray(awayPeriodScores)) {
          console.error(`Invalid period scores format for game ${fullGame.id}: homeScores=${typeof homePeriodScores}, awayScores=${typeof awayPeriodScores}`);
          continue;
        }

        // Convert array elements to numbers if they're strings
        homePeriodScores = homePeriodScores.map(score => typeof score === 'string' ? parseInt(score, 10) : score);
        awayPeriodScores = awayPeriodScores.map(score => typeof score === 'string' ? parseInt(score, 10) : score);

        console.log(`✅ Parsed period scores - home: [${homePeriodScores.join(', ')}], away: [${awayPeriodScores.join(', ')}]`);
      } catch (parseError) {
        console.error(`Failed to parse period scores for game ${fullGame.id}:`, parseError);
        console.error(`Raw data: homeScores=${event.homePeriodScores}, awayScores=${event.awayPeriodScores}`);
        continue;
      }

      // Periods already recorded. The money itself is also guarded by a fixed ledger id
      // per period, so a run that overlaps this one cannot pay twice.
      const existingPayouts = await payoutsOf(fullGame.id);

      const paidPeriods = new Set(existingPayouts.map((p: any) => p.period));

      // Periods 1-3 pay as their scores arrive; the final share pays once, on the final
      // score (overtime included), when the game is over (squaresMoney.periodsToSettle).
      // Overtime periods used to be paid period 4's share again, paying out more than the pot.
      const toSettle = periodsToSettle({
        homeScores: homePeriodScores,
        awayScores: awayPeriodScores,
        eventFinished: event.status === 'FINISHED',
        paid: paidPeriods,
      });

      console.log(`🔍 Game ${fullGame.id}: settling ${toSettle.map((s) => s.period).join(', ') || 'nothing'} (already paid: ${paidPeriods.size})`);

      for (const { period, scoreIndex } of toSettle) {
        const periodEnum = `PERIOD_${period}` as const;

        const homeScore = homePeriodScores[scoreIndex];
        const awayScore = awayPeriodScores[scoreIndex];

        console.log(`🏆 Processing Period ${period} for game ${fullGame.id}: ${awayScore}-${homeScore} (last digits: ${awayScore % 10}-${homeScore % 10})`);

        // Get all purchases (every page)
        const purchases = await purchasesOf(fullGame.id);

        if (purchases.length === 0) {
          console.log(`❌ No purchases found for game ${fullGame.id} - skipping period ${period}`);
          continue;
        }

        console.log(`   Found ${purchases.length} purchases for game ${fullGame.id}`);

        // Find winner
        const winningPurchase = findWinningSquare(fullGame, purchases, homeScore, awayScore);
        console.log(`   Winning purchase for ${awayScore % 10}-${homeScore % 10}:`, winningPurchase ? `${winningPurchase.ownerName} (user: ${winningPurchase.userId})` : 'NONE (house wins)');

        if (!winningPurchase) {
          console.log(`No owner for winning square - house wins Period ${period}`);

          // Create house win payout record for tracking, under the period's fixed id so
          // an overlapping run cannot record (and announce) it twice
          try {
            const now = new Date().toISOString();
            const recorded = await recordPayout({
              id: squaresPayoutRecordId(fullGame.id, periodEnum as SquaresPeriod),
              squaresGameId: fullGame.id,
              squaresPurchaseId: 'HOUSE_WIN', // Sentinel value (cannot use null due to GSI constraint)
              userId: fullGame.creatorId, // Track under creator for notification purposes
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

            if (recorded === 'failed') {
              console.error(`❌ Failed to create house win payout for Period ${period}`);
              console.error(`Payout data: gameId=${fullGame.id}, period=${periodEnum}, scores=${awayScore % 10}-${homeScore % 10}`);
              continue;
            }
            if (recorded === 'exists') {
              console.log(`House win for Period ${period} already recorded by another run`);
              continue;
            }

            // Notify creator that house won this period
            await client.models.Notification.create({
              userId: fullGame.creatorId,
              type: 'SQUARES_PERIOD_WINNER',
              ...notificationMeta('SQUARES_PERIOD_WINNER'),
              title: 'Unsold Square Won',
              message: `Period ${period} in "${fullGame.title}" won by unsold square (${awayScore % 10}-${homeScore % 10}). No payout issued.`,
              priority: 'MEDIUM',
              actionData: JSON.stringify({ squaresGameId: fullGame.id }),
              isRead: false,
              createdAt: now,
            });

            console.log(`✅ Recorded house win for Period ${period}, notified creator`);
            payoutsCreated++;
          } catch (housePayoutError) {
            console.error(`❌ Exception creating house win payout for Period ${period}:`, housePayoutError);
            console.error(`Game: ${fullGame.id}, Period: ${periodEnum}, Scores: ${awayScore}-${homeScore}`);
          }
          continue;
        }

        // Parse payoutStructure (a.json() field - may be string or object)
        let payoutStructure: any;
        try {
          payoutStructure = typeof fullGame.payoutStructure === 'string'
            ? JSON.parse(fullGame.payoutStructure)
            : fullGame.payoutStructure;

          console.log(`   Payout structure:`, payoutStructure);
        } catch (parseError) {
          console.error(`❌ Failed to parse payout structure:`, parseError);
          console.error(`   Raw payoutStructure:`, fullGame.payoutStructure);
          continue;
        }

        // Calculate payout from what the buyers actually paid, not the game's totalPot
        // field (written by buyers' phones, read-then-write, so it can drift or be set)
        const pot = potFromPurchases(purchases);
        const payoutAmount = calculatePayout(period, pot, payoutStructure);

        // CRITICAL: Prevent zero or negative payouts
        if (payoutAmount <= 0) {
          console.error(`❌ INVALID PAYOUT AMOUNT: $${payoutAmount} for Period ${period}`);
          console.error(`   Game: ${fullGame.id}, Pot from purchases: $${pot}, totalPot field: $${fullGame.totalPot}`);
          console.error(`   Payout Structure:`, payoutStructure);
          console.error(`   Winner: ${winningPurchase.ownerName} (${winningPurchase.userId})`);
          console.error(`   SKIPPING PAYOUT CREATION - fix payout structure or total pot`);
          continue; // Skip this period, do not create a $0 payout
        }

        console.log(`   💰 Calculated payout: $${payoutAmount}`);

        const now = new Date().toISOString();

        // Pro waives the platform fee; the winner is only known here. The old code read
        // the balance, added and wrote it back, after recording the period as paid: a
        // failure in between left the period recorded and the winner unpaid, and a
        // winner with no User row was recorded as paid while nobody was credited.
        const { data: buyer } = await client.models.User.get({ id: winningPurchase.userId });
        if (!buyer) {
          console.error(`❌ Winner ${winningPurchase.userId} has no User row; Period ${period} of game ${fullGame.id} left unpaid for review`);
          continue;
        }
        const entry = periodPayoutEntry({
          gameId: fullGame.id,
          period: periodEnum as SquaresPeriod,
          gross: payoutAmount,
          userId: winningPurchase.userId,
          isPro: isProActive(buyer),
        });

        // The money first, through the ledger (the money function), under a fixed id per
        // game and period: a repeat of this period is 'already_applied', never a second
        // credit. Then the record, so a failure between the two is finished next run.
        let credited;
        try {
          credited = await ledgerApply(client, [entry]);
        } catch (creditError) {
          console.error(`❌ Exception crediting Period ${period} of game ${fullGame.id}:`, creditError);
          continue;
        }
        if (credited.status !== 'applied' && credited.status !== 'already_applied') {
          console.error(`❌ Period ${period} of game ${fullGame.id} not credited: ${JSON.stringify(credited)}`);
          continue;
        }

        const payoutId = squaresPayoutRecordId(fullGame.id, periodEnum as SquaresPeriod);
        const recorded = await recordPayout({
          id: payoutId,
          squaresGameId: fullGame.id,
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
        if (recorded === 'failed') {
          // Credited but not recorded: the next run sees the period unrecorded, finds the
          // credit already applied, and writes the record
          console.error(`❌ Period ${period} of game ${fullGame.id} credited but its record failed; will retry`);
          continue;
        }
        if (credited.status === 'already_applied') {
          // Paid by an earlier or overlapping run, which also told the winner
          console.log(`Period ${period} of game ${fullGame.id} was already paid (record ${recorded})`);
          continue;
        }

        // Send notification to buyer, with what they actually received
        const net = entry.delta;
        const isSelfOwned = winningPurchase.ownerName === buyer.displayName;

        const notificationMessage = isSelfOwned
          ? `You won Period ${period}! $${net.toFixed(2)}`
          : `Square for "${winningPurchase.ownerName}" won Period ${period}! You received $${net.toFixed(2)}`;

        try {
          await client.models.Notification.create({
            userId: winningPurchase.userId,
            type: 'SQUARES_PERIOD_WINNER',
            ...notificationMeta('SQUARES_PERIOD_WINNER'),
            title: '🎉 Winner!',
            message: notificationMessage,
            priority: 'HIGH',
            actionData: JSON.stringify({ squaresGameId: fullGame.id, payoutId }),
            isRead: false,
            createdAt: now,
          });
        } catch (notificationError) {
          console.warn(`Failed to notify winner of Period ${period} of game ${fullGame.id}:`, notificationError);
        }

        console.log(`✅ Paid Period ${period} winner: ${winningPurchase.ownerName} - $${payoutAmount} gross, $${net} net`);
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
    const liveGames = await gamesByStatus('LIVE');

    if (liveGames.length === 0) {
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
        // Four payouts make a game: periods 1-3 and the final score (overtime included).
        // Overtime periods are not payouts of their own (squaresMoney.periodsToSettle).
        const expectedPeriods = FINAL_PERIOD;
        let periodsPlayed = 0;
        if (event.homePeriodScores && event.awayPeriodScores) {
          try {
            const homePeriodScores = typeof event.homePeriodScores === 'string'
              ? JSON.parse(event.homePeriodScores) as number[]
              : event.homePeriodScores as number[];
            const awayPeriodScores = typeof event.awayPeriodScores === 'string'
              ? JSON.parse(event.awayPeriodScores) as number[]
              : event.awayPeriodScores as number[];
            if (Array.isArray(homePeriodScores) && Array.isArray(awayPeriodScores)) {
              periodsPlayed = Math.min(homePeriodScores.length, awayPeriodScores.length);
            }
          } catch (parseError) {
            console.log(`⚠️  Could not parse period scores for game ${game.id}`);
          }
        }

        const payoutCount = settledPeriodCount(await payoutsOf(game.id));

        if (payoutCount < expectedPeriods && periodsPlayed >= expectedPeriods && !isOldGame) {
          // The final score is in but its payout is not recorded yet (it pays in the step
          // before this one, and may have failed this run). Leave the game LIVE so the
          // next run pays it; moving it on now would strand the final share.
          console.log(`⏳ Game ${game.id}: final score in, payout not recorded yet (${payoutCount}/${expectedPeriods}); retrying next run`);
          continue;
        }

        if (payoutCount >= expectedPeriods) {
          // All periods paid - resolve game
          console.log(`✅ Resolving game ${game.id} (all ${expectedPeriods} periods paid)`);

          await client.models.SquaresGame.update({
            id: game.id,
            status: 'RESOLVED',
            updatedAt: now.toISOString(),
          });

          resolvedCount++;
        } else {
          // Missing period data
          console.log(`⚠️  Game ${game.id} missing period data (${payoutCount}/${expectedPeriods} periods) - ${isOldGame ? 'old game' : 'event finished'}`);

          await client.models.SquaresGame.update({
            id: game.id,
            status: 'PENDING_RESOLUTION',
            resolutionReason: `Missing period score data (${payoutCount}/${expectedPeriods} periods)`,
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
    // Query ACTIVE and LOCKED games (every page)
    const gamesToCheck = [...(await gamesByStatus('ACTIVE')), ...(await gamesByStatus('LOCKED'))];

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

      // Refunds and the status change are one ledger transaction (see cancelGame). This
      // used to refund by reading and writing each balance and cancel afterwards, so a
      // failure part-way left the game open and the next run refunded everyone again.
      if (await cancelGame(game, `Event ${event.status}`)) cancelledCount++;
    }

    return cancelledCount;
  } catch (error) {
    console.error('Error in cancelGamesForCancelledEvents:', error);
    return 0;
  }
}

// ============ HELPER FUNCTIONS ============

// Rows from the untyped client above (TS2590 on the generated model types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

type Page = { data?: Row[] | null; nextToken?: string | null };

/** Every page of an index query. One page could leave games, and their money, waiting. */
async function listAll(query: (options: { nextToken?: string | null }) => Promise<Page>): Promise<Row[]> {
  const rows: Row[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await query({ nextToken });
    rows.push(...(page.data ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return rows;
}

const gamesByStatus = (status: string) =>
  listAll((options) => client.models.SquaresGame.squaresGamesByStatus({ status }, options));

const purchasesOf = (squaresGameId: string) =>
  listAll((options) => client.models.SquaresPurchase.purchasesBySquaresGame({ squaresGameId }, options));

const payoutsOf = (squaresGameId: string) =>
  listAll((options) => client.models.SquaresPayout.payoutsBySquaresGame({ squaresGameId }, options));

/**
 * Cancel a game and refund every buyer: one ledger transaction for the refunds and the
 * status change, guarded on the status the game was listed with (squaresMoney.ts). True
 * if this run cancelled it. Never throws, so one game cannot stop the others.
 */
async function cancelGame(game: Row, reason: string): Promise<boolean> {
  try {
    const purchases = await purchasesOf(game.id);
    const { outcome, refunds } = await cancelSquaresGame(
      (entries, stateUpdates) => ledgerApply(client, entries, stateUpdates),
      game.id,
      game.status,
      purchases,
      reason
    );
    if (outcome.status === 'skipped') {
      console.log(`⏭️  Game ${game.id} not cancelled: ${outcome.reason}`);
      return false;
    }

    // The ledger wrote the game directly, which fires no subscription
    try {
      await client.models.SquaresGame.update({ id: game.id });
    } catch (touchError) {
      console.warn(`Could not notify subscribers for game ${game.id}:`, touchError);
    }

    const now = new Date().toISOString();
    for (const { userId, amount } of refunds) {
      try {
        await client.models.Notification.create({
          userId,
          type: 'SQUARES_GAME_CANCELLED',
          ...notificationMeta('SQUARES_GAME_CANCELLED'),
          title: 'Game Cancelled',
          message: `"${game.title}" was cancelled. You received a $${amount.toFixed(2)} refund.`,
          priority: 'MEDIUM',
          actionData: JSON.stringify({ squaresGameId: game.id }),
          isRead: false,
          createdAt: now,
        });
      } catch (notificationError) {
        console.warn(`Failed to notify ${userId} of the refund for game ${game.id}:`, notificationError);
      }
    }

    console.log(`✅ Cancelled game ${game.id} (${reason}), refunded ${refunds.length} buyers`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to cancel game ${game.id} (${reason}):`, error);
    return false;
  }
}

/**
 * Write a SquaresPayout record under its fixed id. 'exists' when another run wrote it
 * first: the create is refused, and the row is there.
 */
async function recordPayout(record: Record<string, unknown> & { id: string }): Promise<'created' | 'exists' | 'failed'> {
  try {
    const { data, errors } = await client.models.SquaresPayout.create(record);
    if (data && !errors?.length) return 'created';
    console.warn(`SquaresPayout ${record.id} create returned errors:`, JSON.stringify(errors));
  } catch (error) {
    console.warn(`SquaresPayout ${record.id} create threw:`, error);
  }
  try {
    const { data: existing } = await client.models.SquaresPayout.get({ id: record.id });
    return existing ? 'exists' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Find winning square based on period scores
 */
function findWinningSquare(game: any, purchases: any[], homeScore: number, awayScore: number): any | null {
  if (!game.numbersAssigned || !game.rowNumbers || !game.colNumbers) {
    console.log(`     ⚠️  Game ${game.id} - numbers not assigned yet`);
    return null;
  }

  // Get last digit of each score
  const homeDigit = homeScore % 10;
  const awayDigit = awayScore % 10;

  console.log(`     Looking for: homeDigit=${homeDigit}, awayDigit=${awayDigit}`);
  console.log(`     rowNumbers: [${game.rowNumbers?.join(', ')}]`);
  console.log(`     colNumbers: [${game.colNumbers?.join(', ')}]`);

  // Find column index where colNumbers[col] === awayDigit
  const col = game.colNumbers.indexOf(awayDigit);

  // Find row index where rowNumbers[row] === homeDigit
  const row = game.rowNumbers.indexOf(homeDigit);

  console.log(`     Found col=${col} (for away ${awayDigit}), row=${row} (for home ${homeDigit})`);

  if (col === -1 || row === -1) {
    console.log(`     ⚠️  Could not find digit in grid numbers (col=${col}, row=${row})`);
    return null;
  }

  // Find purchase at (row, col)
  const winner = purchases.find(p => p.gridRow === row && p.gridCol === col) || null;
  console.log(`     Purchase at (${row}, ${col}):`, winner ? `Found - ${winner.ownerName}` : 'Not found (unsold)');

  return winner;
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
