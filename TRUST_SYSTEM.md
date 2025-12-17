# Trust System Documentation

## Overview

The SideBet Trust System is a comprehensive behavioral reputation system that rewards fair play and penalizes bad actors. Trust scores range from 0-10 and dynamically adjust based on user behavior, bet resolutions, transaction history, and dispute outcomes.

**Key Principles:**
- **Start Fair**: All users begin with a 5.0 trust score
- **Earn Trust**: Resolve bets fairly, complete transactions successfully, and build a positive history
- **Lose Trust**: Cancel bets after joins, lose disputes, fail transactions, or delay resolutions
- **Visual Only (Current Phase)**: Trust scores are displayed but do NOT restrict functionality yet
- **Transparent**: All trust score changes are logged with detailed explanations

---

## Trust Score Scale

```
0.0 - 2.0   🚫 Restricted    (Red)      - Cannot create bets or withdraw
2.0 - 4.0   ⚠️  Low Trust     (Orange)   - Cannot create public bets, delayed withdrawals (7 days)
4.0 - 6.0   😐 Neutral       (Gray)     - Normal features with standard delays (5 days)
6.0 - 8.0   🟢 Trusted       (Green)    - Normal features, faster processing (3 days)
8.0 - 10.0  ⭐ Highly Trusted (Gold)     - Premium features, same-day withdrawals, max bet limits
```

**Important**: Trust score tiers are currently **visual indicators only**. Restrictions are not enforced in the current implementation but are defined for future phases.

---

## Database Schema

### User Model
```typescript
User {
  id: string
  email: string
  displayName?: string
  trustScore: number              // 0-10 scale, default: 5.0
  totalBets: number
  totalWinnings: number
  winRate: number
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  createdAt: datetime
  updatedAt: datetime
}
```

### TrustScoreHistory Model
```typescript
TrustScoreHistory {
  id: string
  userId: string                  // User whose score changed
  change: number                  // e.g., +0.2, -3.0
  newScore: number                // Score after this change
  reason: string                  // Human-readable explanation
  relatedBetId?: string           // If related to bet resolution
  relatedTransactionId?: string   // If related to transaction
  relatedDisputeId?: string       // If related to dispute
  createdAt: datetime
}
```

**Authorization**: Users can only read their own trust score history. System (authenticated users) can create entries.

### Dispute Model
```typescript
Dispute {
  id: string
  betId: string                   // Bet being disputed
  filedBy: string                 // User who filed the dispute
  againstUserId: string           // Usually the bet creator
  reason: DisputeReason           // Enum: see below
  description: string             // User's explanation
  status: DisputeStatus           // Enum: see below
  evidenceUrls: string[]          // S3 URLs for supporting evidence
  adminNotes?: string             // Admin's internal notes
  resolvedBy?: string             // Admin user ID who resolved
  resolution?: string             // Admin's explanation of decision
  createdAt: datetime
  resolvedAt?: datetime
}
```

**Dispute Reasons:**
- `INCORRECT_RESOLUTION` - Winner picked wrong
- `NO_RESOLUTION` - Creator never resolved
- `EVIDENCE_IGNORED` - Creator ignored valid evidence
- `OTHER` - Custom reason

**Dispute Statuses:**
- `PENDING` - Newly filed, awaiting admin review
- `UNDER_REVIEW` - Admin actively investigating
- `RESOLVED_FOR_FILER` - Dispute upheld, filer was correct
- `RESOLVED_FOR_CREATOR` - Dispute dismissed, creator was correct
- `DISMISSED` - Dispute rejected without merit

**Authorization**: Users can create and read their own disputes. Admins (authenticated users) can update to resolve.

---

## Trust Score Changes

### Severe Penalties (−2.0 to −3.0)

| Action | Change | Trigger |
|--------|--------|---------|
| **Failed Transaction** | −3.0 | Fraud attempt detected (e.g., invalid Venmo transaction ID) |
| **Lost Dispute (Creator)** | −2.0 | Admin ruled you resolved bet unfairly |
| **Repeated Cancellations** | −2.0 | Pattern of cancelling bets after users join |

### Moderate Penalties (−0.3 to −0.8)

| Action | Change | Trigger |
|--------|--------|---------|
| **Bet Expired No Resolution** | −0.8 | Failed to resolve bet within 24h of deadline |
| **Cancellation After Joins** | −0.6 | Cancelled bet after participants joined (first offense) |
| **Lost Dispute (Participant)** | −0.4 | Filed false dispute, resolution was fair |
| **Multiple Pending Disputes** | −0.3 | Pattern of filing many disputes |

### Minor Penalties (−0.1 to −0.2)

| Action | Change | Trigger |
|--------|--------|---------|
| **Cancellation Before Joins** | −0.2 | Cancelled bet before anyone joined |
| **Slow Resolution** | −0.1 | Resolved bet late (after deadline but within 24h) |

### Rewards (+0.1 to +1.5)

| Action | Change | Trigger |
|--------|--------|---------|
| **Milestone: 50 Bets** | +1.5 | Resolved 50 bets fairly - super user status! |
| **Milestone: 25 Bets** | +1.0 | Resolved 25 bets fairly |
| **Milestone: 10 Bets** | +0.5 | Resolved 10 bets fairly |
| **Won Dispute (Participant)** | +0.3 | Dispute upheld, you correctly challenged unfair resolution |
| **Clean 30 Days** | +0.3 | 30 days without penalties |
| **Dispute Dismissed** | +0.2 | Dispute against you was dismissed - you were right |
| **Clean Resolution** | +0.2 | Bet resolved fairly without disputes |
| **Successful Withdrawal** | +0.15 | Successfully withdrew funds |
| **Successful Deposit** | +0.1 | Successfully deposited funds |

---

## Trust-Based Restrictions (Future Phase)

**Note**: These restrictions are defined in `TrustScoreService` but **NOT currently enforced** in the UI. This is for future implementation.

### Bet Creation Limits

| Trust Tier | Can Create Bets? | Can Create Public Bets? | Max Bet Amount |
|------------|------------------|-------------------------|----------------|
| 🚫 Restricted (< 2.0) | ❌ No | ❌ No | $0 |
| ⚠️ Low Trust (2.0-4.0) | ✅ Yes (private only) | ❌ No | $25 |
| 😐 Neutral (4.0-6.0) | ✅ Yes | ✅ Yes | $100 |
| 🟢 Trusted (6.0-8.0) | ✅ Yes | ✅ Yes | $250 |
| ⭐ Highly Trusted (8.0+) | ✅ Yes | ✅ Yes | $500 |

### Withdrawal Processing Times

| Trust Tier | Can Withdraw? | Processing Time |
|------------|---------------|-----------------|
| 🚫 Restricted (< 2.0) | ❌ Disabled | Contact support |
| ⚠️ Low Trust (2.0-4.0) | ✅ Yes | 7 days (delayed) |
| 😐 Neutral (4.0-6.0) | ✅ Yes | 5 days (standard) |
| 🟢 Trusted (6.0-8.0) | ✅ Yes | 3 days (normal) |
| ⭐ Highly Trusted (8.0+) | ✅ Yes | Same day (premium) |

---

## Bet Resolution & Dispute Flow

### Phase 1: Bet Deadline Passes
```
1. Bet deadline (expiresAt) passes
2. Scheduled Lambda (scheduledBetChecker) runs every 5 minutes
3. Bet moves to PENDING_RESOLUTION status
4. Creator has 24 hours to resolve
```

**If creator doesn't resolve within 24h**:
- Creator receives **−0.8 penalty** (BET_EXPIRED_NO_RESOLUTION)
- Bet automatically cancelled
- All participants refunded

### Phase 2: Creator Resolves Bet
```
1. Creator selects winning side (A or B)
2. Creator provides resolution reason (optional)
3. Bet stays in PENDING_RESOLUTION status
4. Bet.winningSide is set
5. Bet.disputeWindowEndsAt = now + 24 hours
6. 24-hour dispute window begins
```

**UI States During PENDING_RESOLUTION**:
- **Without winningSide**: "Awaiting Resolution" - Creator hasn't decided yet
- **With winningSide**: "Dispute Window Active" - Shows win/loss result + countdown + dispute button

### Phase 3: Dispute Window (24 hours)
```
1. Winners see: "Payout in XX:XX:XX" (countdown to payout)
2. Losers see: "Dispute window ends in XX:XX:XX"
3. ALL participants (including creator) can file disputes
4. Dispute button available on bet card
```

**Filing a Dispute**:
1. User clicks "File Dispute" button
2. Modal opens with dispute form:
   - Reason dropdown (INCORRECT_RESOLUTION, NO_RESOLUTION, EVIDENCE_IGNORED, OTHER)
   - Description text area (required)
   - Evidence upload (optional, future feature)
3. Dispute created with status: PENDING
4. Bet status changes to: DISPUTED (optional, not currently implemented)
5. Payout processing paused until admin resolves

### Phase 4: Admin Reviews Dispute
```
1. Admin opens AdminDisputeScreen
2. Sees all PENDING and UNDER_REVIEW disputes
3. For each dispute, admin sees:
   - Bet title
   - Original resolution (winning side + reason)
   - Who filed dispute and why
   - Evidence (if any)
4. Admin can:
   - Mark UNDER_REVIEW (signals investigation started)
   - Resolve FOR FILER (dispute upheld)
   - Resolve FOR CREATOR (dispute dismissed)
   - Add admin notes and resolution explanation
```

**Admin Resolution Actions**:

**Option A: RESOLVED_FOR_FILER** (Filer wins dispute)
```
1. Admin selects "Uphold Dispute"
2. Provides resolution explanation
3. System applies:
   - Creator: −2.0 penalty (LOST_DISPUTE_CREATOR)
   - Filer: +0.3 reward (WON_DISPUTE_PARTICIPANT)
4. Bet resolution may be changed (admin manually updates winningSide)
5. Payouts recalculated based on corrected resolution
6. Transaction statuses updated
```

**Option B: RESOLVED_FOR_CREATOR** (Creator wins dispute)
```
1. Admin selects "Dismiss Dispute"
2. Provides resolution explanation
3. System applies:
   - Creator: +0.2 reward (DISPUTE_DISMISSED)
   - Filer: −0.4 penalty (LOST_DISPUTE_PARTICIPANT)
4. Original resolution stands
5. Payouts proceed as originally calculated
```

### Phase 5: Dispute Window Expires (No Disputes Filed)
```
1. 24 hours pass with no disputes
2. Bet status changes to: RESOLVED
3. Creator receives: +0.2 reward (BET_RESOLVED_CLEAN)
4. Payout transactions change from PENDING → COMPLETED
5. Winners receive funds (balance updated)
```

---

## Service Layer: TrustScoreService

**Location**: `src/services/trustScoreService.ts`

### Core Methods

#### Read Operations
```typescript
// Get user's current trust score
TrustScoreService.getTrustScore(userId: string): Promise<number>

// Get user's trust score change history
TrustScoreService.getUserTrustHistory(
  userId: string,
  limit?: number
): Promise<TrustScoreHistory[]>

// Get trust score tier (label, color, emoji)
TrustScoreService.getTrustScoreTier(trustScore: number): {
  label: string;    // e.g., "Trusted"
  color: string;    // e.g., "#34C759"
  emoji: string;    // e.g., "🟢"
}
```

#### Write Operations
```typescript
// Core method to apply trust score changes
TrustScoreService.applyChange(
  userId: string,
  change: number,
  reason: string,
  metadata?: {
    relatedBetId?: string;
    relatedTransactionId?: string;
    relatedDisputeId?: string;
  }
): Promise<number>
```

**What it does**:
1. Fetches current trust score
2. Calculates new score (clamped 0-10)
3. Updates User.trustScore
4. Creates TrustScoreHistory entry
5. Returns new score

#### Penalty Methods
```typescript
// Severe Penalties
TrustScoreService.penaltyForFailedTransaction(userId, transactionId, type)
TrustScoreService.penaltyForLostDisputeCreator(userId, betId, disputeId)
TrustScoreService.penaltyForCancellationAfterJoins(userId, betId, title, isRepeated)

// Moderate Penalties
TrustScoreService.penaltyForExpiredBet(userId, betId, title)
TrustScoreService.penaltyForLostDisputeParticipant(userId, betId, disputeId)

// Minor Penalties
TrustScoreService.penaltyForCancellationBeforeJoins(userId, betId, title)
TrustScoreService.penaltyForSlowResolution(userId, betId, title, hoursLate)
```

#### Reward Methods
```typescript
// Milestone Rewards
TrustScoreService.checkAndApplyMilestones(userId)  // Checks 10, 25, 50 bet milestones

// Dispute Rewards
TrustScoreService.rewardForWonDisputeParticipant(userId, betId, disputeId)
TrustScoreService.rewardForDisputeDismissed(userId, betId, disputeId)

// Transaction Rewards
TrustScoreService.rewardForSuccessfulWithdrawal(userId, transactionId, amount)
TrustScoreService.rewardForSuccessfulDeposit(userId, transactionId, amount)

// Bet Resolution Rewards
TrustScoreService.rewardForCleanResolution(userId, betId, title)
```

#### Restriction Checks (Future Phase)
```typescript
// Check if user can create bets
TrustScoreService.canCreateBet(userId): Promise<{
  allowed: boolean;
  reason?: string;
}>

// Check if user can create public bets
TrustScoreService.canCreatePublicBet(userId): Promise<{
  allowed: boolean;
  reason?: string;
}>

// Check if user can withdraw funds
TrustScoreService.canWithdraw(userId): Promise<{
  allowed: boolean;
  delayDays?: number;
  reason?: string;
}>

// Get maximum bet amount for user
TrustScoreService.getMaxBetAmount(userId): Promise<number>
```

---

## Service Layer: DisputeService

**Location**: `src/services/disputeService.ts`

### Core Methods

```typescript
// Create a new dispute
DisputeService.createDispute(params: {
  betId: string;
  filedBy: string;
  againstUserId: string;
  reason: DisputeReason;
  description: string;
  evidenceUrls?: string[];
}): Promise<Dispute>

// Get all pending disputes (admin only)
DisputeService.getPendingDisputes(): Promise<Dispute[]>

// Get disputes for a specific bet
DisputeService.getDisputesForBet(betId: string): Promise<Dispute[]>

// Get user's filed disputes
DisputeService.getUserDisputes(userId: string): Promise<Dispute[]>

// Resolve dispute (admin only)
DisputeService.resolveDispute(params: {
  disputeId: string;
  status: 'RESOLVED_FOR_FILER' | 'RESOLVED_FOR_CREATOR' | 'DISMISSED';
  resolution: string;
  adminNotes?: string;
  resolvedBy: string;  // Admin user ID
}): Promise<boolean>
```

**Admin Validation**: All admin methods (getPendingDisputes, resolveDispute) validate that the calling user has role ADMIN or SUPER_ADMIN.

---

## UI Components

### Current Screens

#### 1. AccountScreen
**Location**: `src/screens/AccountScreen.tsx`

**Trust Score Display**:
```typescript
<View style={styles.trustContainer}>
  <Text style={styles.trustLabel}>Trust Score</Text>
  <Text style={styles.trustScore}>{userProfile.trustScore.toFixed(1)}/10</Text>
</View>
```

**Pending Payouts**:
- Shows available balance separately from pending payouts
- Pending payouts = sum of all PENDING BET_WON transactions
- Displayed in warning color to indicate funds are held

#### 2. AdminDisputeScreen
**Location**: `src/screens/AdminDisputeScreen.tsx`

**Features**:
- Admin-only access (role validation on mount)
- Lists all PENDING and UNDER_REVIEW disputes
- Filter by status (ALL, PENDING, UNDER_REVIEW)
- Shows bet details, users involved, dispute reason
- Resolve modal with admin notes and resolution explanation
- Apply trust score changes based on resolution

**Access**: Only visible to users with role ADMIN or SUPER_ADMIN via AccountScreen menu option.

#### 3. FileDisputeModal
**Location**: `src/components/ui/FileDisputeModal.tsx`

**Features**:
- Triggered from BetCard "File Dispute" button
- Reason dropdown (4 options)
- Description text area (required)
- Evidence upload placeholder (future feature)
- Creates dispute with status PENDING
- Sends notification to bet creator

**Availability**: Shown on PENDING_RESOLUTION bets during dispute window (24h after winningSide is set).

### Future Screens (Planned)

#### 4. TrustScoreHistoryScreen
**Status**: Not yet implemented

**Purpose**: Show users their trust score changes over time

**Features**:
- Chronological list of all trust score changes
- Each entry shows: date, change (+/-), new score, reason
- Color-coded by change type (green for positive, red for negative)
- Link to related bets/transactions when applicable
- Filter by time period (last 7 days, 30 days, all time)

**Location**: Accessible from AccountScreen trust score section

#### 5. TrustSafetyScreen
**Location**: `src/screens/TrustSafetyScreen.tsx` (exists but needs review)

**Purpose**: Educate users about trust system and safety

**Features** (to be implemented):
- Trust system explanation
- How to maintain good trust score
- What affects trust score
- Dispute process explanation
- Safety tips for betting

---

## Integration Points

### When Trust Score Changes Are Applied

#### Bet Lifecycle
1. **Bet Created**: No change (neutral action)
2. **Bet Cancelled (Before Joins)**: Creator gets −0.2 penalty
3. **Bet Cancelled (After Joins)**: Creator gets −0.6 penalty (−2.0 if repeated)
4. **Bet Expired (No Resolution)**: Creator gets −0.8 penalty
5. **Bet Resolved (Clean)**: After dispute window ends, creator gets +0.2 reward
6. **Bet Resolved (Slow)**: Creator gets −0.1 penalty per hour late

#### Transaction Lifecycle
1. **Deposit Completed**: User gets +0.1 reward
2. **Deposit Failed**: User gets −3.0 penalty (fraud attempt)
3. **Withdrawal Completed**: User gets +0.15 reward
4. **Withdrawal Failed**: User gets −3.0 penalty (fraud attempt)

#### Dispute Lifecycle
1. **Dispute Filed**: No immediate change
2. **Dispute Upheld (FOR_FILER)**:
   - Creator gets −2.0 penalty (LOST_DISPUTE_CREATOR)
   - Filer gets +0.3 reward (WON_DISPUTE_PARTICIPANT)
3. **Dispute Dismissed (FOR_CREATOR)**:
   - Creator gets +0.2 reward (DISPUTE_DISMISSED)
   - Filer gets −0.4 penalty (LOST_DISPUTE_PARTICIPANT)

### Where to Call TrustScoreService

**TransactionService** (`src/services/transactionService.ts`):
```typescript
// After deposit/withdrawal approved by admin
if (status === 'COMPLETED') {
  if (transaction.type === 'DEPOSIT') {
    await TrustScoreService.rewardForSuccessfulDeposit(userId, transactionId, amount);
  } else if (transaction.type === 'WITHDRAWAL') {
    await TrustScoreService.rewardForSuccessfulWithdrawal(userId, transactionId, amount);
  }
} else if (status === 'FAILED') {
  await TrustScoreService.penaltyForFailedTransaction(userId, transactionId, type);
}
```

**ResolveScreen** (`src/screens/ResolveScreen.tsx`):
```typescript
// After bet resolved and dispute window expires
if (noDisputesFiled && disputeWindowExpired) {
  await TrustScoreService.rewardForCleanResolution(creatorId, betId, title);
}
```

**DisputeService** (`src/services/disputeService.ts`):
```typescript
// After admin resolves dispute
if (resolution === 'RESOLVED_FOR_FILER') {
  await TrustScoreService.penaltyForLostDisputeCreator(creatorId, betId, disputeId);
  await TrustScoreService.rewardForWonDisputeParticipant(filerId, betId, disputeId);
} else if (resolution === 'RESOLVED_FOR_CREATOR') {
  await TrustScoreService.rewardForDisputeDismissed(creatorId, betId, disputeId);
  await TrustScoreService.penaltyForLostDisputeParticipant(filerId, betId, disputeId);
}
```

**ScheduledBetChecker Lambda** (`amplify/functions/scheduled-bet-checker/handler.ts`):
```typescript
// When bet expires without resolution
if (betExpired && noResolution) {
  await TrustScoreService.penaltyForExpiredBet(creatorId, betId, title);
}
```

---

## Testing the Trust System

### Manual Testing Checklist

#### Clean Resolution Flow
1. ✅ Create bet as User A
2. ✅ Join bet as User B
3. ✅ Wait for deadline to pass
4. ✅ Resolve bet as User A
5. ✅ Wait 24 hours (no disputes)
6. ✅ Verify User A gets +0.2 reward
7. ✅ Verify payout completes

#### Dispute Flow (Filer Wins)
1. ✅ Create bet as User A
2. ✅ Join bet as User B
3. ✅ Resolve incorrectly as User A
4. ✅ File dispute as User B
5. ✅ Admin resolves FOR_FILER
6. ✅ Verify User A gets −2.0 penalty
7. ✅ Verify User B gets +0.3 reward
8. ✅ Verify resolution corrected

#### Dispute Flow (Creator Wins)
1. ✅ Create bet as User A
2. ✅ Join bet as User B
3. ✅ Resolve correctly as User A
4. ✅ File false dispute as User B
5. ✅ Admin resolves FOR_CREATOR
6. ✅ Verify User A gets +0.2 reward
7. ✅ Verify User B gets −0.4 penalty

#### Cancellation Flow
1. ✅ Create bet as User A
2. ✅ Cancel before anyone joins
3. ✅ Verify User A gets −0.2 penalty
4. ✅ Create another bet
5. ✅ Have User B join
6. ✅ Cancel bet
7. ✅ Verify User A gets −0.6 penalty

#### Failed Transaction Flow
1. ✅ Request deposit with fake Venmo transaction ID
2. ✅ Admin rejects as FAILED
3. ✅ Verify user gets −3.0 penalty
4. ✅ Verify balance not credited

### Test User Scenarios

**Good User Profile** (Trust Score: 8.5):
- 30 bets created and resolved cleanly
- 0 disputes filed against them
- 5 successful deposits
- 3 successful withdrawals
- No cancellations after joins

**Problematic User Profile** (Trust Score: 3.2):
- 10 bets created
- 4 cancelled after users joined
- Lost 2 disputes as creator
- 1 failed deposit (fraud attempt)
- Slow to resolve bets (average 12 hours late)

**Restricted User Profile** (Trust Score: 1.5):
- Multiple failed transactions
- Lost 3 disputes
- Pattern of cancelling bets
- Banned from creating bets
- Cannot withdraw funds

---

## Future Enhancements

### Phase 2: Enforcement
- [ ] Implement trust-based bet creation limits
- [ ] Implement trust-based withdrawal delays
- [ ] Implement max bet amount restrictions
- [ ] Add "restricted user" warnings in UI
- [ ] Show withdrawal delay countdown

### Phase 3: Gamification
- [ ] Trust score badges on user profiles
- [ ] Leaderboard for highest trust scores
- [ ] Achievement system for milestones
- [ ] Trust score recovery paths for low-score users
- [ ] "Clean streak" tracking (days without penalties)

### Phase 4: Advanced Features
- [ ] AI-assisted dispute resolution (flag suspicious patterns)
- [ ] Trust score decay for inactive users
- [ ] Peer review system (users vote on resolutions)
- [ ] Trust score insurance (pay to protect score during disputes)
- [ ] Tiered dispute fees (higher trust = lower fees)

---

## Important Notes for Developers

### Never Hardcode Trust Changes
❌ **Bad**:
```typescript
await client.models.User.update({
  id: userId,
  trustScore: currentScore - 2.0
});
```

✅ **Good**:
```typescript
await TrustScoreService.penaltyForLostDisputeCreator(userId, betId, disputeId);
```

**Why**: TrustScoreService ensures changes are logged, clamped, and auditable.

### Always Provide Context
❌ **Bad**:
```typescript
await TrustScoreService.applyChange(userId, -0.8, "Penalty");
```

✅ **Good**:
```typescript
await TrustScoreService.penaltyForExpiredBet(
  userId,
  betId,
  "Lakers vs Warriors - March 15"
);
```

**Why**: Users deserve to know exactly why their score changed.

### Test Edge Cases
- User at 0.0 trust score (cannot go lower)
- User at 10.0 trust score (cannot go higher)
- Multiple simultaneous trust changes (race conditions)
- Dispute filed in last second of window
- Admin resolves dispute while another admin is viewing
- User deletes account with pending disputes

### Security Considerations
- **Admin validation**: All admin operations validate role
- **User isolation**: Users can only see their own trust history
- **Audit trail**: All changes logged with relational IDs
- **No client-side changes**: Trust score only modified server-side
- **Dispute evidence**: Validate and sanitize uploaded files

---

## Related Documentation

- **[MODAL_STANDARDS.md](./MODAL_STANDARDS.md)** - Modal UI patterns (for FileDisputeModal)
- **[CLAUDE.md](./CLAUDE.md)** - Main architecture and development guide
- **[PUSH_NOTIFICATION_GUIDE.md](./PUSH_NOTIFICATION_GUIDE.md)** - Notification system (for dispute alerts)

---

## Contact & Support

For questions about trust system implementation:
1. Review this documentation first
2. Check existing code in `src/services/trustScoreService.ts`
3. Test with AdminDisputeScreen for admin workflows
4. Create GitHub issue for bugs or feature requests

**Last Updated**: 2025-11-16
**Version**: 1.0 (Visual Display Phase)
**Next Phase**: Enforcement & Restrictions
