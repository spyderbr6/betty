# Betting Squares Implementation Plan

## Overview
Implement a betting squares system where users can buy spots on a 10x10 grid tied to live sporting events. Winners are determined by matching the last digit of each team's score at the end of each period (Q1, Q2, Q3, Q4). Fully automated using ESPN API period scores.

## Implementation Status
✅ **Phase 1: Backend Infrastructure** - COMPLETED
✅ **Phase 2: Automation Layer** - COMPLETED
✅ **Phase 3: UI Components** - COMPLETED
✅ **Phase 4: Create Screen Integration** - COMPLETED
✅ **Phase 4: My Bets Integration** - COMPLETED
✅ **Phase 4: Home/Join Feed Integration** - COMPLETED
✅ **Phase 4: Results Screen Integration** - COMPLETED
✅ **Navigation Wiring** - COMPLETED
✅ **Bug Fixes (JSON, formatDateTime, params)** - COMPLETED
✅ **UX Improvements (Contrast, Admin Controls, Ordering)** - COMPLETED
🔲 **Phase 5: Polish & Features** - PENDING

## Current Status Summary

### ✅ What's Working
- Users can create squares games from Create tab
- Event picker filters to next 7 days, prioritizes LIVE events
- Games appear in My Bets → Active section
- Tapping a card navigates to SquaresGameDetailScreen
- Detail screen shows grid, event info, payout structure
- All GraphQL queries, mutations working
- JSON serialization correct for payoutStructure
- Date formatting functional across all screens

### 🔧 Ready for Testing
- Full create → view → navigate flow
- Purchase squares functionality (UI exists, needs E2E test)
- Grid display and owner name system
- Automated Lambda triggers (deployed but untested in production)

---

## Database Schema

### 1. SquaresGame Model

```typescript
SquaresGame {
  id: string
  title: string (e.g., "Steelers vs Browns Squares")
  description?: string
  eventId: string (FK to LiveEvent - for auto scoring)

  // Pricing & Pot
  pricePerSquare: float (e.g., 10.00)
  totalPot: float (calculated: squares sold * price)

  // Game Configuration
  payoutStructure: json ({
    period1: 0.15,  // 15% of pot
    period2: 0.25,  // 25% (halftime)
    period3: 0.15,  // 15%
    period4: 0.45   // 45% (final)
  })

  // Grid State
  rowNumbers: integer[] (array[10]: 0-9 randomized AFTER grid fills)
  colNumbers: integer[] (array[10]: 0-9 randomized AFTER grid fills)
  numbersAssigned: boolean (false until grid locks)

  // Status Flow
  status: enum [
    'SETUP',              // Creator building game, accepting purchases
    'ACTIVE',             // Grid filling up
    'LOCKED',             // Grid full or game started, numbers assigned
    'LIVE',               // Game in progress
    'PENDING_RESOLUTION', // Game finished, checking for period data
    'RESOLVED',           // All payouts complete
    'CANCELLED'           // Cancelled, refunds issued
  ]

  // Metadata
  creatorId: string
  squaresSold: integer (denormalized count: 0-100)
  locksAt: datetime (when grid locks - typically game start time)
  expiresAt: datetime (game end time from LiveEvent)
  createdAt: datetime
  updatedAt: datetime

  // Relations
  creator: belongsTo User
  event: belongsTo LiveEvent
  purchases: hasMany SquaresPurchase
  payouts: hasMany SquaresPayout
}
```

**Secondary Indexes:**
- `status` + `createdAt` → `squaresGamesByStatus`
- `eventId` → `squaresGamesByEvent`
- `creatorId` + `createdAt` → `squaresGamesByCreator`

---

### 2. SquaresPurchase Model

```typescript
SquaresPurchase {
  id: string
  squaresGameId: string
  userId: string (who bought and paid - always has account)

  // Grid Position
  gridRow: integer (0-9)
  gridCol: integer (0-9)

  // Owner Display
  ownerName: string (display name - can be buyer or anyone else)
  // Examples: "John Smith", "Mom", "Dave from work", "Sarah"
  // Defaults to buyer's displayName
  // Buyer handles offline payment to non-member if their square wins

  // Transaction
  amount: float (price paid by userId)
  transactionId: string? (FK to Transaction)

  // Metadata
  purchasedAt: datetime

  // Relations
  buyer: belongsTo User (userId - who paid)
  squaresGame: belongsTo SquaresGame
}
```

**Secondary Indexes:**
- `squaresGameId` + `purchasedAt` → `purchasesBySquaresGame`
- `userId` + `purchasedAt` → `purchasesByBuyer`

---

### 3. SquaresPayout Model

```typescript
SquaresPayout {
  id: string
  squaresGameId: string
  squaresPurchaseId: string (which square won)
  userId: string (buyer who receives payout)
  ownerName: string (name displayed as winner)

  // Payout Details
  period: enum ['PERIOD_1', 'PERIOD_2', 'PERIOD_3', 'PERIOD_4']
  amount: float (portion of pot after 3% platform fee)

  // Winning Score
  homeScore: integer (last digit)
  awayScore: integer (last digit)
  homeScoreFull: integer (full score for display)
  awayScoreFull: integer (full score for display)

  // Transaction
  transactionId: string? (FK to Transaction)
  status: enum ['PENDING', 'COMPLETED', 'FAILED']

  // Metadata
  createdAt: datetime
  paidAt: datetime?

  // Relations
  squaresGame: belongsTo SquaresGame
  squaresPurchase: belongsTo SquaresPurchase
  buyer: belongsTo User (userId)
}
```

**Secondary Indexes:**
- `squaresGameId` + `period` → `payoutsBySquaresGame`
- `userId` + `createdAt` → `payoutsByUser`

---

### 4. Transaction Model Extensions

**Add to existing Transaction type:**
```typescript
type TransactionType =
  | ... existing types ...
  | 'SQUARES_PURCHASE'    // Buying square
  | 'SQUARES_PAYOUT'      // Period winner payout
  | 'SQUARES_REFUND'      // Game cancelled refund

// Add new field:
relatedSquaresGameId?: string
```

---

## Service Layer

### SquaresGameService (`src/services/squaresGameService.ts`)

**Core Methods:**

```typescript
class SquaresGameService {

  // Create new squares game
  static async createSquaresGame(params: {
    creatorId: string
    eventId: string
    title: string
    description?: string
    pricePerSquare: number
    payoutStructure?: {
      period1: number
      period2: number
      period3: number
      period4: number
    }
  }): Promise<SquaresGame>

  // Purchase square(s) with owner name
  static async purchaseSquares(params: {
    squaresGameId: string
    userId: string (buyer who pays)
    ownerName: string (display name for grid)
    squares: Array<{ row: number, col: number }>
  }): Promise<SquaresPurchase[]>

  // Lock grid and assign numbers (auto-triggered)
  static async lockGridAndAssignNumbers(
    squaresGameId: string
  ): Promise<boolean>

  // Process period scores and create payouts
  static async processPeriodScores(
    squaresGameId: string,
    period: number,
    homeScore: number,
    awayScore: number
  ): Promise<SquaresPayout | null>

  // Cancel game and refund all participants
  static async cancelSquaresGame(
    squaresGameId: string,
    reason: string
  ): Promise<boolean>

  // Get available squares for a game
  static async getAvailableSquares(
    squaresGameId: string
  ): Promise<Array<{row: number, col: number}>>

  // Get full game with all purchases
  static async getSquaresGameWithPurchases(
    squaresGameId: string
  ): Promise<{
    game: SquaresGame
    purchases: SquaresPurchase[]
    payouts: SquaresPayout[]
  }>

  // Helper: Find winning square
  private static findWinningSquare(
    game: SquaresGame,
    purchases: SquaresPurchase[],
    homeScore: number,
    awayScore: number
  ): SquaresPurchase | null

  // Helper: Calculate payout for period
  private static calculatePayout(
    period: number,
    totalPot: number,
    payoutStructure: PayoutStructure
  ): number
}
```

**Winner Calculation Algorithm:**
```typescript
function findWinningSquare(
  game: SquaresGame,
  purchases: SquaresPurchase[],
  homeScore: number,
  awayScore: number
): SquaresPurchase | null {

  // Get last digit of each score
  const homeDigit = homeScore % 10
  const awayDigit = awayScore % 10

  // Find column index where colNumbers[col] === awayDigit
  const col = game.colNumbers.indexOf(awayDigit)

  // Find row index where rowNumbers[row] === homeDigit
  const row = game.rowNumbers.indexOf(homeDigit)

  // Find purchase at (row, col)
  return purchases.find(p =>
    p.gridRow === row && p.gridCol === col
  ) || null
}
```

**Payout Calculation:**
```typescript
function calculatePayout(
  period: number,
  totalPot: number,
  payoutStructure: { period1, period2, period3, period4 }
): number {

  const percentages = [
    payoutStructure.period1,  // Period 1 (e.g., 0.15 = 15%)
    payoutStructure.period2,  // Period 2 (e.g., 0.25 = 25% halftime)
    payoutStructure.period3,  // Period 3 (e.g., 0.15 = 15%)
    payoutStructure.period4   // Period 4 (e.g., 0.45 = 45% final)
  ]

  const percentage = percentages[period - 1]
  const grossPayout = totalPot * percentage

  // Apply 3% platform fee (consistent with bet winnings)
  const platformFee = grossPayout * 0.03
  const netPayout = grossPayout - platformFee

  return Math.round(netPayout * 100) / 100
}
```

---

### TransactionService Extensions

**New Methods:**

```typescript
// In src/services/transactionService.ts

export class TransactionService {

  static async recordSquaresPurchase(
    userId: string,
    amount: number,
    squaresGameId: string,
    purchaseIds: string
  ): Promise<Transaction | null> {
    return await this.createTransaction({
      userId,
      type: 'SQUARES_PURCHASE',
      amount: -amount,  // Debit
      status: 'COMPLETED',
      relatedSquaresGameId: squaresGameId,
      notes: `Purchased squares: ${purchaseIds}`,
    });
  }

  static async recordSquaresPayout(
    userId: string,
    amount: number,
    squaresGameId: string,
    payoutId: string,
    period: string
  ): Promise<Transaction | null> {
    return await this.createTransaction({
      userId,
      type: 'SQUARES_PAYOUT',
      amount: amount,  // Credit
      status: 'COMPLETED',
      relatedSquaresGameId: squaresGameId,
      notes: `${period} winner payout`,
    });
  }

  static async recordSquaresRefund(
    userId: string,
    amount: number,
    squaresGameId: string,
    purchaseId: string
  ): Promise<Transaction | null> {
    return await this.createTransaction({
      userId,
      type: 'SQUARES_REFUND',
      amount: amount,  // Credit
      status: 'COMPLETED',
      relatedSquaresGameId: squaresGameId,
      notes: `Game cancelled - square refund`,
    });
  }
}
```

---

### NotificationService Extensions

**New Notification Types:**

```typescript
type NotificationType =
  | ... existing types ...
  | 'SQUARES_GRID_LOCKED'        // Grid filled, numbers assigned
  | 'SQUARES_PERIOD_WINNER'      // You won a period!
  | 'SQUARES_GAME_LIVE'          // Game starting soon
  | 'SQUARES_GAME_CANCELLED'     // Game cancelled
  | 'SQUARES_PURCHASE_CONFIRMED' // Purchase confirmed
```

---

### BulkLoadingService Extensions

**New Methods:**

```typescript
// In src/services/bulkLoadingService.ts

/**
 * Load squares games with purchases and payouts
 */
async function bulkLoadSquaresGamesWithData(
  statusFilters: SquaresGameStatus[],
  options?: { limit?: number, useCache?: boolean }
): Promise<SquaresGame[]> {

  // 1. Query games by status (GSI)
  // 2. Get all purchases for these games (single query with IN filter)
  // 3. Get all payouts for these games (single query with IN filter)
  // 4. Client-side join and cache

  // Reduces N+1 queries to 3 total queries
}

/**
 * Load user's squares games (as buyer)
 */
async function bulkLoadUserSquaresGames(
  userId: string,
  options?: { includeCompleted?: boolean }
): Promise<SquaresGame[]> {

  // 1. Query purchases by userId (GSI)
  // 2. Get unique squaresGameIds
  // 3. Bulk load games with data
}
```

---

## Automation Layer

### scheduledSquaresChecker Lambda Function

**File:** `amplify/functions/scheduled-squares-checker/handler.ts`

**Schedule:** Every 5 minutes (`*/5 * * * ? *`)

**Purpose:** Monitor squares games and handle state transitions + auto-payouts

**Logic Flow:**

```typescript
export const handler: EventBridgeHandler<"Scheduled Event", null, boolean> = async (event) => {

  // 1. LOCK GRIDS (ACTIVE → LOCKED)
  // Find games in ACTIVE status where locksAt <= now OR squaresSold >= 100
  const gamesToLock = await findGamesToLock();
  for (const game of gamesToLock) {
    await SquaresGameService.lockGridAndAssignNumbers(game.id);
    // Send notifications to all buyers
  }

  // 2. START GAMES (LOCKED → LIVE)
  // Find games in LOCKED status where event.status = LIVE
  const gamesToStart = await findGamesToStart();
  for (const game of gamesToStart) {
    await updateGameStatus(game.id, 'LIVE');
    // Send "Game is LIVE!" notifications
  }

  // 3. PROCESS PERIOD SCORES (LIVE)
  // Find games in LIVE status
  const liveGames = await findLiveGames();
  for (const game of liveGames) {
    const event = await getEventData(game.eventId);

    // Check each period (1-4)
    for (let period = 1; period <= 4; period++) {
      // Skip if already paid
      if (await hasPayoutForPeriod(game.id, period)) continue;

      // Check if period score is available
      const periodScore = getPeriodScore(event, period);
      if (!periodScore) continue;

      // Process winner
      await SquaresGameService.processPeriodScores(
        game.id,
        period,
        periodScore.homeScore,
        periodScore.awayScore
      );
    }
  }

  // 4. RESOLVE GAMES (LIVE → RESOLVED)
  // Find games in LIVE status where event.status = FINISHED
  const gamesToResolve = await findGamesToResolve();
  for (const game of gamesToResolve) {
    // Verify all 4 periods have payouts
    const payoutCount = await countPayouts(game.id);
    if (payoutCount === 4) {
      await updateGameStatus(game.id, 'RESOLVED');
      // Send final notifications
    } else {
      // Missing period data - wait or escalate
      await updateGameStatus(game.id, 'PENDING_RESOLUTION');
    }
  }

  // 5. HANDLE CANCELLATIONS
  // Find games where event.status = CANCELLED or POSTPONED
  const gamesToCancel = await findGamesToCancel();
  for (const game of gamesToCancel) {
    await SquaresGameService.cancelSquaresGame(game.id, 'Event cancelled');
  }

  return true;
};
```

---

## UI Components

### 1. Card Components

#### SquaresGameCard (`src/components/betting/SquaresGameCard.tsx`)
- Compact display for list views
- Shows: title, event info, pot, squares available, status badge
- Tap → Navigate to SquaresGameDetailScreen

#### LiveEventCard (`src/components/events/LiveEventCard.tsx`)
- Shows live scores, status, teams
- Period-by-period scores table
- Count of attached squares games
- Tap → Navigate to LiveEventDetailScreen

#### MySquaresGameCard (`src/components/betting/MySquaresGameCard.tsx`)
- Shows user's purchased squares grouped by ownerName
- Total invested amount
- Winnings (if any)

---

### 2. Form Components

#### CreateSquaresForm (`src/components/betting/CreateSquaresForm.tsx`)

**Steps:**
1. Select Event (EventPickerModal)
2. Set Price Per Square ($5-$100)
3. Adjust Payout Structure (sliders with live preview)
4. Add Description (optional)
5. Create Button

**Validation:**
- Event must be selected
- Price must be valid number
- Payout structure must total 100%
- Default payout: 15/25/15/45

---

### 3. Grid Component

#### SquaresGrid (`src/components/betting/SquaresGrid.tsx`)

**Key Features:**
- 10x10 interactive grid
- Column headers (away team numbers) - shown after lock
- Row headers (home team numbers) - shown after lock
- Cell states:
  - Available (green tint)
  - Selected (blue with checkmark)
  - Owned by current user (yellow border)
  - Owned by others (gray with owner name)
- Touch to select/deselect (when editable)
- Shows truncated owner names in cells
- Small dot indicator for user-purchased squares

**Grid Layout:**
```
         Away Team (COL)
       0  1  2  3  4  5  6  7  8  9
    ┌──────────────────────────────┐
  0 │░░│  │  │  │XX│  │  │  │  │  │
  1 │  │░░│  │  │XX│  │  │  │  │  │
H 2 │  │  │  │  │  │  │  │  │  │  │
o 3 │  │  │XX│  │  │  │  │  │  │  │
m 4 │  │  │  │  │  │  │  │  │  │  │
e 5 │  │  │  │  │  │  │  │  │  │  │
  6 │  │  │  │  │  │  │  │  │  │  │
  7 │  │  │  │  │  │  │  │  │  │  │
  8 │  │  │  │  │  │  │  │  │  │  │
  9 │  │  │  │  │  │  │  │  │  │  │
    └──────────────────────────────┘

Legend:
░░ = Available (green)
XX = User selected (blue)
[Name] = Owned square
```

---

### 4. Modal Components

#### EventPickerModal (`src/components/modals/EventPickerModal.tsx`)
- Filter by league (All, NBA, NFL)
- List of upcoming events (next 7 days)
- Shows: teams, date/time, venue
- Search functionality

#### PurchaseSquaresModal (`src/components/modals/PurchaseSquaresModal.tsx`)
- Selected squares display
- **Owner Name input** (key feature)
  - Text input with autocomplete
  - Quick suggestions: "Me", recent names
  - Hint text explaining offline payment responsibility
- Cost summary
- Confirm purchase button

---

### 5. Screen Components

#### SquaresGameDetailScreen (`src/screens/SquaresGameDetailScreen.tsx`)

**Sections:**
1. Header (title, back button, share button)
2. Event Info Card (teams, date, venue)
3. Game Stats (price, squares sold, pot, status)
4. Payout Structure (prize breakdown by period)
5. **SquaresGrid** (main interactive component)
6. My Squares Summary (grouped by owner name)
7. Period Winners (if game is LIVE/RESOLVED)
8. Action Buttons:
   - "Buy Squares" (if ACTIVE)
   - Selection summary (count + total cost)

#### LiveEventDetailScreen (`src/screens/LiveEventDetailScreen.tsx`)

**Sections:**
1. Live Scoreboard (big scores, status badge)
2. Period Scores Table
3. Squares Games Section
   - Horizontal scrollable list
   - "Create Squares Game" button
4. Event Details (venue, city, league)

#### MySquaresList (`src/components/betting/MySquaresList.tsx`)

**Features:**
- Filter by status: Active, Live, Completed
- Status counts in chips
- List of games user has purchased squares in
- Group squares by owner name within each game

---

### 6. UI Elements

#### WinnerToast (`src/components/ui/WinnerToast.tsx`)
- Animated celebration for period winners
- Trophy icon
- Confetti animation
- Amount display
- Auto-dismiss after 5 seconds

#### PayoutStructureDisplay (`src/components/ui/PayoutStructureDisplay.tsx`)
- Visual breakdown of prize distribution
- Shows percentage and dollar amount per period
- Highlighted halftime and final periods

---

## Navigation Integration

### Updated Navigation Structure

```typescript
// src/navigation/AppNavigator.tsx

// Bottom Tabs (no changes needed)
Home | Create | My Bets | Friends | Account

// Stack Navigator additions:
<Stack.Screen
  name="SquaresGameDetail"
  component={SquaresGameDetailScreen}
  options={{ title: 'Squares Game' }}
/>
<Stack.Screen
  name="LiveEventDetail"
  component={LiveEventDetailScreen}
  options={{ title: 'Live Game' }}
/>
```

### Screen Flow

```
HomeScreen
  → [Filter: Squares]
  → Tap SquaresGameCard
  → SquaresGameDetailScreen
    → Tap "Buy Squares"
    → Select squares on grid
    → Tap "Purchase"
    → PurchaseSquaresModal (enter owner name)
    → Confirm
    → Success toast
    → Grid updates

CreateScreen
  → Toggle: Squares
  → CreateSquaresForm
    → Tap "Select Game"
    → EventPickerModal
    → Select event
    → Set price + payouts
    → Tap "Create"
    → Navigate to SquaresGameDetailScreen

MyBetsScreen
  → Tab: Squares
  → MySquaresList
  → Tap game card
  → SquaresGameDetailScreen

HomeScreen
  → [Filter: Live Events]
  → Tap LiveEventCard
  → LiveEventDetailScreen
    → See squares games section
    → Tap game
    → SquaresGameDetailScreen
```

---

## Complete User Journeys

### Journey 1: Creator Creates Squares Game

```
1. Open app → Home/Create screen
2. Tap Create tab
3. Toggle to "Squares" mode
4. Tap "Select Game" → EventPickerModal opens
5. Filter to NFL → See list of upcoming games
6. Tap "Steelers @ Browns - Sun 1:00 PM"
7. Modal closes, event info appears
8. Set price: $10 per square
9. Adjust sliders:
   - Period 1: 15%
   - Halftime: 25%
   - Period 3: 15%
   - Final: 45%
10. See preview: "Total pot if full: $1,000"
11. Add description: "Sunday pool - good luck!"
12. Tap "Create Squares Game"
13. Navigate to SquaresGameDetailScreen
14. See empty grid, status "ACTIVE"
15. Tap share → Send link to friends
```

---

### Journey 2: User Buys Squares for Self

```
1. Home screen → See SquaresGameCard
2. Card shows: "Steelers @ Browns Squares | $10/sq | 23/100 filled"
3. Tap card → SquaresGameDetailScreen
4. View grid (green = available, names = taken)
5. Tap 3 available squares (turn blue with checkmarks)
6. Bottom bar: "3 squares selected - $30.00"
7. Tap "Buy 3 Squares" button
8. PurchaseSquaresModal opens
9. Owner name field auto-filled with "John Smith" (user's display name)
10. See suggestion chips: "Me" | "Mom" | "Dave"
11. Leave as "John Smith"
12. See summary: 3 squares × $10 = $30
13. Tap "Purchase 3 Squares"
14. Modal closes, grid updates
15. User's 3 squares now show "John S." (truncated)
16. Toast: "Squares purchased! Grid: 26/100"
```

---

### Journey 3: User Buys Squares for Non-Member Friend

```
1. SquaresGameDetailScreen (already viewing game)
2. Select 2 squares
3. Tap "Buy 2 Squares"
4. PurchaseSquaresModal opens
5. Clear "John Smith" from owner name field
6. Type "Dave from work"
7. See hint: "This name will appear on the grid. You'll receive winnings and handle payment to them."
8. See summary: 2 squares × $10 = $20
9. Tap "Purchase 2 Squares"
10. Modal closes
11. Grid updates: 2 squares now show "Dave" (truncated)
12. In "My Squares" section, see:
    - John Smith (3 squares)
    - Dave from work (2 squares)
    Total invested: $50
13. No notification sent to Dave (non-member)
```

---

### Journey 4: Grid Locks & Numbers Assigned

```
1. Grid reaches 100 squares sold
   OR game start time (locksAt) reached
2. scheduledSquaresChecker Lambda runs (every 5 min)
3. Detects grid should lock
4. Generates random numbers:
   - colNumbers = [4,7,0,3,8,1,5,9,2,6] (shuffled 0-9)
   - rowNumbers = [2,9,5,0,7,4,1,8,3,6] (shuffled 0-9)
5. Updates game: status = LOCKED, numbersAssigned = true
6. Sends push notifications to all buyers:
   "Numbers assigned! Check your squares"
7. User taps notification → SquaresGameDetailScreen
8. Grid now shows numbers on edges:
   - Top row: Away team (Steelers) numbers
   - Left column: Home team (Browns) numbers
9. User's squares now show their number combos:
   - Square 1: 7-3 (Away: 7, Home: 3)
   - Square 2: 4-5
   - Square 3: 0-2
10. Status badge changes to "LOCKED 🔒"
```

---

### Journey 5: Game Goes Live

```
1. Scheduled game time arrives
2. ESPN API updates event status to LIVE
3. scheduledSquaresChecker detects: event.status = LIVE
4. Updates squares game: status = LIVE
5. Sends push notification to all buyers:
   "Game is LIVE! Steelers @ Browns started"
6. User can watch:
   - LiveEventDetailScreen for live scores
   - SquaresGameDetailScreen to see their squares
7. Period scores update in real-time from ESPN
```

---

### Journey 6: User Wins Period

```
1. End of Period 1: Steelers 17, Browns 13
2. scheduledSquaresChecker runs (5 min later)
3. Fetches event: homePeriodScores = [13], awayPeriodScores = [17]
4. Processes Period 1:
   - Last digits: 7 (away) × 3 (home)
   - Looks up: colNumbers[col] = 7, rowNumbers[row] = 3
   - Finds col index = 1, row index = 9
   - Finds purchase at grid position (9, 1)
   - Purchase belongs to userId: user123
   - Purchase ownerName: "John Smith"
5. Calculates payout:
   - Total pot: $1,000
   - Period 1: 15% = $150
   - Platform fee: 3% = $4.50
   - Net payout: $145.50
6. Creates SquaresPayout record
7. Credits user123 balance: +$145.50
8. Creates transaction record
9. Sends push notification:
   "🎉 YOU WON PERIOD 1! $145.50"
10. User taps notification
11. WinnerToast appears (confetti animation)
12. SquaresGameDetailScreen shows:
    - Winner highlight on grid (gold border)
    - Winners section: "Period 1: John Smith - $145.50"
```

---

### Journey 7: Non-Member Square Wins

```
1. End of Period 2 (Halftime): Steelers 24, Browns 20
2. scheduledSquaresChecker processes:
   - Last digits: 4 (away) × 0 (home)
   - Finds square at position matching (4, 0)
   - Purchase belongs to userId: user123
   - Purchase ownerName: "Dave from work"
3. Calculates payout:
   - Total pot: $1,000
   - Period 2 (halftime): 25% = $250
   - Platform fee: 3% = $7.50
   - Net payout: $242.50
4. Credits user123 balance: +$242.50
5. Sends notification to user123:
   "Square for 'Dave from work' won Period 2! You received $242.50"
6. User sees notification
7. User handles offline: "Hey Dave, your square won! I'll Venmo you $242.50"
8. SquaresGameDetailScreen shows:
   - Period 2 winner: "Dave from work - $242.50"
   - Badge: "You bought this" (next to winner name)
```

---

### Journey 8: Game Completes

```
1. Game ends: Final score Steelers 31, Browns 27
2. ESPN API updates: status = FINISHED, all period scores available
3. scheduledSquaresChecker processes remaining periods (3 & 4)
4. Period 3 winner: Last digits 1-7
5. Period 4 winner: Last digits 1-7 (same square can win multiple times!)
6. All 4 periods have payouts
7. Updates game: status = RESOLVED
8. Sends final summary notification to all buyers:
   "Game complete! View final results"
9. SquaresGameDetailScreen shows:
   - Status: RESOLVED ✅
   - Full winners table:
     * Period 1: John Smith - $145.50
     * Period 2: Dave from work - $242.50
     * Period 3: Sarah - $145.50
     * Period 4: Mike - $436.50
   - Transaction history updated
```

---

## Edge Cases & Error Handling

### 1. Incomplete Period Data
```
Scenario: ESPN doesn't have period scores yet
- Keep game in LIVE status
- Check again in next scheduled run (5 min)
- After 24 hours: Status → PENDING_RESOLUTION
- Notify creator: "Missing period data - manual intervention may be needed"
- Allow creator to manually enter scores OR cancel with refunds
```

### 2. Overtime Games
```
Scenario: Game goes to overtime
- Period 4 payout uses regulation end score
- Overtime points don't change Period 4 winner
- Configurable option: includeOvertimeInFinal (default: false)
```

### 3. Unsold Squares Win
```
Scenario: Grid locks with only 87 squares sold
- 13 squares remain unsold (no owner)
- If unsold square wins a period:
  - No payout created (no owner)
  - Log event: "House won Period X"
  - Notify creator: "Unsold square won Period 2 - no payout"
  - Keep funds (or redistribute to other periods - configurable)
```

### 4. Cancelled/Postponed Game
```
Scenario: Event cancelled before game starts
- scheduledSquaresChecker detects event.status = CANCELLED
- Updates game: status = CANCELLED
- Refunds all purchases via TransactionService.recordSquaresRefund()
- Sends notifications: "Game cancelled - full refund issued"
- Mark resolutionReason: "Event cancelled by league"
```

### 5. Duplicate Period Payouts
```
Scenario: Lambda runs twice, tries to pay same period twice
- Check if payout already exists for (gameId, period)
- Skip if already paid
- Log: "Period X already paid, skipping"
- No duplicate transactions
```

### 6. Insufficient Buyer Balance
```
Scenario: User tries to buy squares with insufficient balance
- Validation in SquaresGameService.purchaseSquares()
- Check balance before creating purchases
- Throw error: "Insufficient balance"
- Show error toast in UI
- Transaction not created
```

### 7. Grid Full Race Condition
```
Scenario: Two users try to buy last square simultaneously
- Database handles via optimistic locking
- First write wins
- Second write fails validation: "Square already taken"
- Show error toast: "Square was just taken, please select another"
- Refresh grid
```

---

## Platform Fees

### Fee Structure
- **Square Purchase:** No fee (users pay face value)
- **Period Payouts:** 3% platform fee (consistent with bet winnings)

### Example: $10/square game (100 squares sold)
```
Total pot: $1,000

Period 1 (15%):
  Gross: $150
  Platform fee (3%): $4.50
  Net to winner: $145.50

Period 2 - Halftime (25%):
  Gross: $250
  Platform fee (3%): $7.50
  Net to winner: $242.50

Period 3 (15%):
  Gross: $150
  Platform fee (3%): $4.50
  Net to winner: $145.50

Period 4 - Final (45%):
  Gross: $450
  Platform fee (3%): $13.50
  Net to winner: $436.50

Total platform revenue: $30.00 (3% of $1,000 pot)
Total paid to winners: $970.00
```

---

## Implementation Phases

### Phase 1: Database Schema & Core Services (Backend)
**Time Estimate:** 2-3 hours

1. Update `amplify/data/resource.ts`:
   - Add SquaresGame model
   - Add SquaresPurchase model
   - Add SquaresPayout model
   - Add indexes
   - Update Transaction type

2. Deploy schema: `npm run deploy`

3. Create `src/services/squaresGameService.ts`:
   - Implement all core methods
   - Winner calculation logic
   - Payout calculation logic
   - Grid locking logic

4. Update `src/services/transactionService.ts`:
   - Add squares transaction types
   - Add recordSquaresPurchase()
   - Add recordSquaresPayout()
   - Add recordSquaresRefund()

5. Update `src/services/notificationService.ts`:
   - Add squares notification types
   - Add navigation handlers

---

### Phase 2: Automation Layer (Lambda)
**Time Estimate:** 2-3 hours

1. Create `amplify/functions/scheduled-squares-checker/`:
   - `resource.ts` - Function definition
   - `handler.ts` - Lambda logic
   - `package.json` - Dependencies

2. Implement state machine:
   - Lock grids (ACTIVE → LOCKED)
   - Start games (LOCKED → LIVE)
   - Process period scores (LIVE)
   - Resolve games (LIVE → RESOLVED)
   - Handle cancellations

3. Add to `amplify/backend.ts`

4. Add to `amplify/data/resource.ts` schema authorization

5. Deploy: `npm run deploy`

6. Test with mock data

---

### Phase 3: Basic UI Components (Minimum Viable Experience)
**Time Estimate:** 4-5 hours

1. Create `src/components/betting/SquaresGameCard.tsx`:
   - Compact card for list views
   - Event info, pot, status

2. Create `src/components/betting/SquaresGrid.tsx`:
   - 10x10 interactive grid
   - Cell selection logic
   - Owner name display
   - Number headers (after lock)

3. Create `src/screens/SquaresGameDetailScreen.tsx`:
   - Full game view
   - Embedded SquaresGrid
   - Stats, payouts, winners
   - Purchase flow

4. Create `src/components/modals/PurchaseSquaresModal.tsx`:
   - Owner name input (key feature)
   - Quick suggestions
   - Cost summary
   - Confirm button

5. Create `src/components/betting/CreateSquaresForm.tsx`:
   - Event selection
   - Price input
   - Payout sliders
   - Validation

---

### Phase 4: Discovery & Integration (Connect to App)
**Time Estimate:** 3-4 hours

1. Update `src/screens/HomeScreen.tsx`:
   - Add filter tabs (All, Bets, Squares, Live Events)
   - Integrate SquaresGameCard in feed
   - Add LiveEventCard

2. Update `src/screens/CreateScreen.tsx`:
   - Add segmented control (Bet / Squares)
   - Integrate CreateSquaresForm

3. Update `src/screens/MyBetsScreen.tsx`:
   - Add "Squares" tab
   - Create MySquaresList component
   - Show user's games

4. Create `src/components/modals/EventPickerModal.tsx`:
   - League filter
   - Upcoming events list
   - Search functionality

5. Create `src/screens/LiveEventDetailScreen.tsx`:
   - Live scoreboard
   - Period scores table
   - Squares games section

6. Update navigation:
   - Add new screen routes
   - Deep linking for notifications

---

### Phase 5: Polish & Social Features (Nice-to-Haves)
**Time Estimate:** 2-3 hours

1. Create `src/components/ui/WinnerToast.tsx`:
   - Confetti animation
   - Trophy icon
   - Celebration styling

2. Add share functionality:
   - Share game link
   - Invite friends

3. Add filters and sorting:
   - Sort by pot size, squares available, start time
   - Filter by league, status

4. Add statistics:
   - User's total squares winnings
   - Win rate by position
   - Popular number combinations

5. Add PayoutStructureDisplay component:
   - Visual prize breakdown
   - Highlighted periods

---

## Testing Strategy

### Unit Tests
- SquaresGameService.findWinningSquare()
- SquaresGameService.calculatePayout()
- Grid locking logic
- Transaction creation

### Integration Tests
- Full purchase flow
- Grid locking when full
- Period payout processing
- Game cancellation refunds

### End-to-End Tests
- Create game → Buy squares → Lock grid → Game live → Process periods → Resolve
- Non-member square wins flow
- Multiple buyers same game
- Edge cases (unsold squares, missing data)

---

## Success Metrics

### MVP Launch Criteria
- ✅ Users can create squares games
- ✅ Users can buy squares for self or others
- ✅ Grid locks automatically (100 squares or game start)
- ✅ Numbers assigned randomly
- ✅ Period winners calculated automatically
- ✅ Payouts credited automatically
- ✅ Notifications sent for all events
- ✅ Transaction history tracked

### Performance Targets
- Grid rendering: <500ms
- Purchase flow: <2 seconds
- Period payout processing: <30 seconds after score available
- Lambda execution: <10 seconds per run

### User Experience Goals
- Intuitive square selection
- Clear owner name labeling
- Real-time grid updates
- Celebration for winners
- Transparent payout breakdown

---

## Future Enhancements (Post-MVP)

1. **Advanced Grid Patterns**
   - Allow creators to pre-assign numbers (not random)
   - Support non-square grids (5x5, 20x20)

2. **Multi-Period Pools**
   - Create pools for entire season
   - Weekly squares games

3. **Team Features**
   - Allow groups to pool squares
   - Split winnings among team members

4. **Analytics Dashboard**
   - Best performing numbers
   - Historical win rates
   - User statistics

5. **Social Features**
   - Leaderboards
   - Achievements/badges
   - Share grid on social media

6. **Payment Integration**
   - Auto-split winnings to non-members via Venmo
   - Direct payout options

---

## Risk Mitigation

### Technical Risks
- **ESPN API downtime:** Cache last known scores, allow manual entry
- **Lambda timeouts:** Batch processing, pagination
- **Race conditions:** Optimistic locking, idempotency keys
- **Database hot partitions:** Proper GSI design, caching

### Business Risks
- **Regulatory compliance:** Consult legal for gambling laws
- **Platform fees too high:** Monitor user feedback, adjust
- **Fraud/abuse:** Rate limiting, suspicious activity detection

### User Experience Risks
- **Complex UI:** User testing, simplified onboarding
- **Notification spam:** Configurable preferences, batching
- **Confusion on non-member payouts:** Clear messaging, tooltips

---

## Appendix

### Design System Usage
- Use `colors.*`, `typography.*`, `spacing.*`, `shadows.*`
- Follow MODAL_STANDARDS.md for all modals
- Use `commonStyles.*` patterns
- Use `showAlert()` instead of `Alert.alert()`

### API Resources
- ESPN API: Live scores and period data
- GraphQL subscriptions: Real-time updates
- S3: No storage needed for squares (pure data)

### Documentation References
- Main guide: CLAUDE.md
- Modal standards: MODAL_STANDARDS.md
- Push notifications: PUSH_NOTIFICATION_GUIDE.md

---

END OF PLAN
