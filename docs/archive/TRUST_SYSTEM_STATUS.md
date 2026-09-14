# Trust System Integration Status

**Last Updated**: 2025-11-16

## Current Implementation Status

### ✅ What's WIRED UP (Actually Modifying Trust Scores)

#### 1. **Clean Bet Resolution** (+0.2 reward)
**Location**: `amplify/functions/payout-processor/handler.ts:174-201`

**Trigger**: When dispute window expires without any disputes

**Code**:
```typescript
// payout-processor Lambda directly updates trust score
const newTrustScore = Math.min(10, (creator.trustScore || 5.0) + 0.2);

await client.models.User.update({
  id: bet.creatorId,
  trustScore: newTrustScore
});

// Records change in TrustScoreHistory
await client.models.TrustScoreHistory.create({
  userId: bet.creatorId,
  change: 0.2,
  newScore: newTrustScore,
  reason: `Bet "${bet.title}" resolved fairly without disputes`,
  relatedBetId: bet.id,
  createdAt: new Date().toISOString()
});
```

**Status**: ✅ **WORKING** - Manually implemented in Lambda (not using TrustScoreService)

---

### ❌ What's NOT Wired Up (Defined But Not Called)

The following are fully implemented in `TrustScoreService` but **never called** anywhere in the codebase:

#### 1. **Deposit/Withdrawal Rewards**
- ❌ `rewardForSuccessfulDeposit()` (+0.1) - Not called in TransactionService
- ❌ `rewardForSuccessfulWithdrawal()` (+0.15) - Not called in TransactionService

**Should be in**: `src/services/transactionService.ts:updateTransactionStatus()`

#### 2. **Transaction Fraud Penalties**
- ❌ `penaltyForFailedTransaction()` (−3.0) - Not called anywhere

**Should be in**: `src/services/transactionService.ts:updateTransactionStatus()` when admin rejects transaction

#### 3. **Dispute Resolution Trust Changes**
- ❌ `penaltyForLostDisputeCreator()` (−2.0) - Not called in DisputeService
- ❌ `rewardForWonDisputeParticipant()` (+0.3) - Not called in DisputeService
- ❌ `rewardForDisputeDismissed()` (+0.2) - Not called in DisputeService
- ❌ `penaltyForLostDisputeParticipant()` (−0.4) - Not called in DisputeService

**Should be in**: `src/services/disputeService.ts:resolveDispute()` (line 289-409)

**Current Status**: DisputeService has comments mentioning trust scores but doesn't import or call TrustScoreService

#### 4. **Bet Cancellation Penalties**
- ❌ `penaltyForCancellationBeforeJoins()` (−0.2) - Not called anywhere
- ❌ `penaltyForCancellationAfterJoins()` (−0.6) - Not called anywhere

**Should be in**: Wherever bets are cancelled (needs investigation - might be in screens or a service)

#### 5. **Bet Expiration Penalties**
- ❌ `penaltyForExpiredBet()` (−0.8) - Not called in scheduled-bet-checker

**Should be in**: `amplify/functions/scheduled-bet-checker/handler.ts` when bet expires without resolution

**Current Status**: scheduled-bet-checker moves bets to PENDING_RESOLUTION but doesn't check if creator failed to resolve within 24h

#### 6. **Slow Resolution Penalties**
- ❌ `penaltyForSlowResolution()` (−0.1) - Not called anywhere

**Should be in**: ResolveScreen or payout-processor when creator resolves late

#### 7. **Milestone Rewards**
- ❌ `checkAndApplyMilestones()` (+0.5 / +1.0 / +1.5) - Not called anywhere

**Should be in**: payout-processor after bet resolved, or as a separate cron job

---

## Trust Score Display (Read-Only)

### ✅ Where Trust Scores Are DISPLAYED

1. **AccountScreen** (`src/screens/AccountScreen.tsx:418-421`)
   - Shows user's current trust score: `{userProfile.trustScore.toFixed(1)}/10`
   - Fetches from User model on load

2. **FriendRequestsModal** (`src/components/ui/FriendRequestsModal.tsx:289`)
   - Shows trust score of users who sent friend requests
   - Displays as: `Trust: {item.fromUser.trustScore.toFixed(1)}`

3. **BetsScreen** (`src/screens/BetsScreen.tsx:183`)
   - Loads trust score when fetching user data
   - Not currently displayed in UI (just loaded)

### ❌ Where Trust Scores Are NOT DISPLAYED (But Should Be)

1. **User Profiles** - No trust score badges or tier indicators
2. **Bet Cards** - Creator's trust score not shown
3. **Participant Lists** - Participant trust scores not visible
4. **Leaderboards** - No trust score rankings
5. **Create Bet Screen** - No trust-based bet limits enforced or shown

---

## Trust-Based Restrictions (Future Phase)

### ❌ None of These Are Enforced Yet

All restriction check methods exist in TrustScoreService but are **never called**:

1. `canCreateBet()` - Not checked in CreateBetScreen
2. `canCreatePublicBet()` - Not checked anywhere
3. `canWithdraw()` - Not checked in withdrawal flow
4. `getMaxBetAmount()` - Not used to limit bet creation

**Current Status**: Trust scores are purely informational. No restrictions are enforced regardless of trust score.

---

## Database Schema Status

### ✅ Fully Implemented

1. **User.trustScore** - Column exists, default value 5.0
2. **TrustScoreHistory** model - Table exists with all fields
3. **Dispute** model - Table exists with all fields

### ✅ Authorization Rules Working

- Users can read their own TrustScoreHistory
- System can create TrustScoreHistory entries
- Admins can resolve disputes

---

## Summary: What Actually Works Right Now

**Trust Score Changes:**
- ✅ Clean bet resolutions: +0.2 (via payout-processor Lambda)
- ❌ Everything else: Defined but not triggered

**Trust Score Display:**
- ✅ AccountScreen shows current score
- ✅ FriendRequestsModal shows scores
- ❌ No tier badges or visual indicators

**Trust Score History:**
- ✅ Database model exists
- ✅ payout-processor records clean resolution rewards
- ❌ No UI to view history (TrustScoreHistoryScreen not implemented)

**Trust-Based Restrictions:**
- ❌ None enforced (all users can do everything regardless of trust score)

---

## Next Steps to Complete Trust System

### Phase 1: Wire Up Existing Penalties/Rewards (High Priority)

1. **Dispute Resolution** - Add TrustScoreService calls to DisputeService.resolveDispute()
   - Import TrustScoreService
   - Call penalty/reward methods based on dispute outcome
   - Test admin dispute resolution flow

2. **Transaction Trust Changes** - Add to TransactionService.updateTransactionStatus()
   - Reward for successful deposits/withdrawals
   - Penalty for failed/fraudulent transactions
   - Test admin approval/rejection flow

3. **Bet Expiration** - Add to scheduled-bet-checker Lambda
   - Track when bets move to PENDING_RESOLUTION
   - Create second Lambda to check if creator resolved within 24h
   - Apply penalty if not resolved in time

4. **Bet Cancellation** - Find where cancellations happen, add penalties
   - Check if participants exist before cancellation
   - Apply appropriate penalty (−0.2 vs −0.6)
   - Detect repeated cancellations

5. **Milestone Rewards** - Add to payout-processor
   - Check creator's resolved bet count after each payout
   - Apply milestone rewards at 10, 25, 50 bets
   - Ensure milestones only trigger once

### Phase 2: Improve Trust Score Display (Medium Priority)

6. **Trust Score Badges** - Add visual indicators to user profiles
   - Show tier emoji (🚫 ⚠️ 😐 🟢 ⭐) next to names
   - Color-code based on tier
   - Add to BetCard for bet creators

7. **TrustScoreHistoryScreen** - Create UI to view history
   - Chronological list of all trust changes
   - Filter by time period
   - Link to related bets/transactions

8. **Trust Tier Explanation** - Add info modal
   - Explain what each tier means
   - Show current benefits/restrictions
   - Educational content about maintaining trust

### Phase 3: Enforce Restrictions (Low Priority / Future)

9. **Bet Creation Limits** - Enforce in CreateBetScreen
   - Check trust score before allowing bet creation
   - Limit bet amounts based on tier
   - Show clear error messages

10. **Withdrawal Delays** - Enforce in withdrawal flow
    - Show expected processing time based on trust tier
    - Queue withdrawals with appropriate delays
    - Display countdown to withdrawal availability

11. **Public Bet Restrictions** - Add to CreateBetScreen
    - Low-trust users can only create private bets
    - Show upgrade path to unlock public bets

---

## Code Quality Notes

### Issues Found

1. **Inconsistent Implementation**:
   - payout-processor manually updates trust scores instead of using TrustScoreService
   - Should refactor to use centralized service for consistency

2. **Missing Imports**:
   - DisputeService mentions trust scores in comments but doesn't import TrustScoreService
   - TransactionService has no trust score logic at all

3. **No Bet Expiry Tracking**:
   - scheduled-bet-checker moves bets to PENDING_RESOLUTION
   - But nothing tracks if creator resolves within 24h
   - Need separate Lambda or logic in payout-processor

4. **Cancellation Logic Unknown**:
   - Unclear where/how bets are cancelled
   - Need to search for cancellation endpoints
   - Penalties can't be applied until this is found

### Recommendations

1. **Refactor payout-processor** to use `TrustScoreService.rewardForCleanResolution()` instead of manual updates

2. **Create integration tests** for trust score changes:
   - Test each penalty/reward scenario
   - Verify TrustScoreHistory entries are created
   - Ensure scores clamp to 0-10 range

3. **Add monitoring/logging**:
   - Track trust score changes in application logs
   - Alert on unusual patterns (rapid decreases)
   - Dashboard for admin to view trust score distribution

4. **Document integration points** in code comments:
   - Mark where TrustScoreService should be called
   - Add TODO comments for missing integrations

---

## Testing Checklist

### Currently Testable

- [x] Clean bet resolution adds +0.2 to creator trust score
- [x] TrustScoreHistory entry is created with correct data
- [x] Trust score displays correctly in AccountScreen
- [x] Trust score clamped to max 10.0

### Not Yet Testable (Not Wired Up)

- [ ] Dispute resolution affects trust scores
- [ ] Failed transactions penalize trust scores
- [ ] Successful deposits/withdrawals reward trust scores
- [ ] Bet cancellations penalize trust scores
- [ ] Expired bets penalize creator trust scores
- [ ] Milestone rewards trigger at correct counts
- [ ] Trust restrictions actually block actions

---

## Related Files

- **Service**: `src/services/trustScoreService.ts` (fully implemented, mostly unused)
- **Payout Lambda**: `amplify/functions/payout-processor/handler.ts` (manually updates trust on line 174-201)
- **Bet Checker Lambda**: `amplify/functions/scheduled-bet-checker/handler.ts` (no trust logic)
- **Dispute Service**: `src/services/disputeService.ts` (mentions trust, doesn't use it)
- **Transaction Service**: `src/services/transactionService.ts` (no trust logic)
- **Documentation**: `TRUST_SYSTEM.md` (comprehensive reference)

---

**Bottom Line**: The trust system infrastructure is ~95% built but only ~5% wired up. TrustScoreService is production-ready but needs to be imported and called from the right places. The only thing actually working is the clean bet resolution reward in the payout-processor Lambda.
