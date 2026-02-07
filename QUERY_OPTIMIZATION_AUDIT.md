# DynamoDB Query Optimization Audit

> **⚠️ NOTE (2026-02):** The primary data loading path for bets and squares has been replaced by `BetDataContext` (`src/contexts/BetDataContext.tsx`), which uses GSI queries (`betsByStatus`, `squaresGamesByStatus`) and targeted subscriptions. The `bulkLoadingService` referenced below is now dead code. This audit remains useful for understanding GSI patterns and DynamoDB query behavior across other services.

**Date:** 2025-12-13
**Issue:** Multiple services are using inefficient DynamoDB queries with filter expressions instead of properly indexed queries.

## The Problem

DynamoDB applies `filter` expressions **AFTER** data retrieval:
1. Query/Scan retrieves up to `LIMIT` items
2. Filter is applied to those items
3. Returns only matching items (could be 0-LIMIT)

This causes:
- ❌ Unpredictable result counts
- ❌ Multiple round-trips to get desired data
- ❌ Higher read capacity costs
- ❌ Slower response times

## Solution: Add Global Secondary Indexes (GSI)

GSI allows **direct querying** on non-primary key attributes:
- ✅ Predictable result counts
- ✅ Single query per request
- ✅ Lower read capacity costs
- ✅ Faster response times

---

## CRITICAL Priority - High Traffic Queries

### 1. **Bet Queries by Status** 🔥🔥🔥
**Impact:** HOME SCREEN - highest traffic endpoint in the app

**Current Implementation:**
```typescript
// src/services/bulkLoadingService.ts:169
client.models.Bet.list({
  filter: {
    or: [
      { status: { eq: 'ACTIVE' } },
      { status: { eq: 'LIVE' } }
    ]
  },
  limit: 100
})
```

**Problem:**
- Scans ALL bets, filters for ACTIVE/LIVE
- Home screen loads this on every visit
- With 1000+ bets, will scan all to find ~50 active ones

**Recommended GSI:**
```typescript
Bet: a.model({...})
  .secondaryIndexes((index) => [
    index('status')
      .sortKeys(['createdAt'])
      .queryField('betsByStatus')
  ])
```

**New Query:**
```typescript
client.models.Bet.betsByStatus({
  status: 'ACTIVE'
}, {
  limit: 100,
  sortDirection: 'DESC'
})
```

**Impact:** 10-100x faster home screen loads

---

### 2. **Participant Queries by BetId** 🔥🔥
**Impact:** Every bet join, acceptance check, payout calculation

**Current Implementation:**
```typescript
// src/services/betAcceptanceService.ts:51, 137, 186, 248, 300
client.models.Participant.list({
  filter: { betId: { eq: betId } }
})

// Also queried with userId filter:
client.models.Participant.list({
  filter: {
    and: [
      { betId: { eq: betId } },
      { userId: { eq: userId } }
    ]
  }
})
```

**Problem:**
- Queried 5+ times across bet lifecycle
- Scans all participants to find ones for specific bet
- Critical for bet resolution and acceptance tracking

**Recommended GSI:**
```typescript
Participant: a.model({...})
  .secondaryIndexes((index) => [
    index('betId')
      .sortKeys(['userId'])
      .queryField('participantsByBet'),
    index('userId')
      .sortKeys(['betId'])
      .queryField('participantsByUser')
  ])
```

**New Queries:**
```typescript
// Get all participants for a bet
client.models.Participant.participantsByBet({
  betId: betId
})

// Check if user participated in bet
client.models.Participant.participantsByUser({
  userId: userId,
  betId: { eq: betId }
})
```

**Impact:** Faster bet joins, acceptance checks, resolutions

---

### 3. **Transaction Queries by UserId** 🔥🔥
**Impact:** Transaction history screen, account page

**Current Implementation:**
```typescript
// src/services/transactionService.ts:656
client.models.Transaction.list({
  filter: {
    userId: { eq: userId },
    type: { eq: 'DEPOSIT' },     // Optional filter
    status: { eq: 'COMPLETED' }  // Optional filter
  },
  limit: 50
})
```

**Problem:**
- Scans all transactions, filters by userId + type + status
- User transaction history is frequently viewed
- With 10,000 transactions, scans all to find 50 for one user

**Recommended GSI:**
```typescript
Transaction: a.model({...})
  .secondaryIndexes((index) => [
    index('userId')
      .sortKeys(['createdAt'])
      .queryField('transactionsByUser'),
    index('userId')
      .sortKeys(['type', 'createdAt'])
      .queryField('transactionsByUserAndType')
  ])
```

**New Query:**
```typescript
client.models.Transaction.transactionsByUser({
  userId: userId
}, {
  limit: 50,
  sortDirection: 'DESC'
})

// With type filter:
client.models.Transaction.transactionsByUserAndType({
  userId: userId,
  type: { eq: 'DEPOSIT' }
}, {
  limit: 50,
  sortDirection: 'DESC'
})
```

**Impact:** Instant transaction history loading

---

### 4. **Transaction Queries by Status** 🔥
**Impact:** Admin dashboard - pending transaction queue

**Current Implementation:**
```typescript
// src/services/transactionService.ts:699
client.models.Transaction.list({
  filter: {
    status: { eq: 'PENDING' }
  }
})
```

**Problem:**
- Admin dashboard refreshes this frequently
- Scans all transactions to find PENDING ones
- Slow admin workflow

**Recommended GSI:**
```typescript
Transaction: a.model({...})
  .secondaryIndexes((index) => [
    index('status')
      .sortKeys(['createdAt'])
      .queryField('transactionsByStatus')
  ])
```

**New Query:**
```typescript
client.models.Transaction.transactionsByStatus({
  status: 'PENDING'
}, {
  sortDirection: 'ASC' // Oldest first for admin processing
})
```

**Impact:** Faster admin transaction approval workflow

---

### 5. **PaymentMethod Queries by UserId** 🔥
**Impact:** Account settings, deposit/withdrawal flows

**Current Implementation:**
```typescript
// src/services/paymentMethodService.ts:123
client.models.PaymentMethod.list({
  filter: {
    userId: { eq: userId },
    isActive: { eq: true }  // Optional
  }
})
```

**Problem:**
- Queried every time user deposits/withdraws
- Scans all payment methods to find user's methods

**Recommended GSI:**
```typescript
PaymentMethod: a.model({...})
  .secondaryIndexes((index) => [
    index('userId')
      .sortKeys(['isActive', 'createdAt'])
      .queryField('paymentMethodsByUser')
  ])
```

**New Query:**
```typescript
client.models.PaymentMethod.paymentMethodsByUser({
  userId: userId,
  isActive: { eq: true }
})
```

**Impact:** Faster payment method loading in deposit/withdrawal flows

---

## MEDIUM Priority - Moderate Traffic

### 6. **BetInvitation Queries**
**Impact:** Bet creation, invitation acceptance

**Current Implementation:**
```typescript
// src/services/bulkLoadingService.ts:444, 559
client.models.BetInvitation.list({
  filter: {
    and: [
      { toUserId: { eq: userId } },
      { status: { eq: 'PENDING' } }
    ]
  }
})
```

**Recommended GSI:**
```typescript
BetInvitation: a.model({...})
  .secondaryIndexes((index) => [
    index('toUserId')
      .sortKeys(['status', 'createdAt'])
      .queryField('invitationsByRecipient')
  ])
```

---

### 7. **EventCheckIn Queries**
**Impact:** Event check-in feature

**Current Implementation:**
```typescript
// src/services/eventService.ts:74
client.models.EventCheckIn.list({
  filter: {
    userId: { eq: userId },
    isActive: { eq: true }
  }
})
```

**Recommended GSI:**
```typescript
EventCheckIn: a.model({...})
  .secondaryIndexes((index) => [
    index('userId')
      .sortKeys(['isActive', 'checkInTime'])
      .queryField('checkInsByUser')
  ])
```

---

### 8. **Dispute Queries**
**Impact:** Dispute system (currently low volume)

**Current Implementation:**
```typescript
// src/services/disputeService.ts:68, 85, 143, 235, 252, 269
// Multiple queries by filedBy, betId, status
```

**Recommended GSIs:**
```typescript
Dispute: a.model({...})
  .secondaryIndexes((index) => [
    index('betId')
      .sortKeys(['status'])
      .queryField('disputesByBet'),
    index('filedBy')
      .sortKeys(['status', 'createdAt'])
      .queryField('disputesByUser'),
    index('status')
      .sortKeys(['createdAt'])
      .queryField('disputesByStatus')
  ])
```

---

### 9. **TrustScoreHistory Queries**
**Impact:** User stats/profile pages

**Current Implementation:**
```typescript
// src/services/trustScoreService.ts:148
client.models.TrustScoreHistory.list({
  filter: { userId: { eq: userId } },
  limit: 20
})
```

**Recommended GSI:**
```typescript
TrustScoreHistory: a.model({...})
  .secondaryIndexes((index) => [
    index('userId')
      .sortKeys(['createdAt'])
      .queryField('trustHistoryByUser')
  ])
```

---

### 10. **LiveEvent Queries**
**Impact:** Event discovery, check-in

**Current Implementation:**
```typescript
// src/services/eventService.ts:344
client.models.LiveEvent.list({
  filter: {
    or: [
      { status: { eq: 'LIVE' } },
      { status: { eq: 'UPCOMING' } },
      { status: { eq: 'HALFTIME' } }
    ]
  }
})
```

**Recommended GSI:**
```typescript
LiveEvent: a.model({...})
  .secondaryIndexes((index) => [
    index('status')
      .sortKeys(['scheduledTime'])
      .queryField('eventsByStatus')
  ])
```

---

## LOW Priority - Infrequent or Cleanup Queries

### 11. NotificationPreferences by UserId
**Issue:** Only 1 record per user, could use `.get()` if userId was primary key
**Current:** Scanning to find single record
**Fix:** Consider restructuring to use userId as primary key

### 12. PushToken Cleanup
**Current:** `filter: { userId, lastUsed: { lt: cutoffDate } }`
**Impact:** Cleanup job runs infrequently
**Decision:** OK as-is, not worth index for rare cleanup

### 13. Notification Deletion Cleanup
**Current:** `filter: { userId, createdAt: { lt: cutoffDate } }`
**Impact:** Cleanup job runs infrequently
**Decision:** OK as-is (but we added GSI for read queries)

### 14. Friendship Queries
**Current:** Queries by user1Id and user2Id
**Status:** Already using indexes properly (belongsTo creates GSI)
**Decision:** No changes needed ✅

---

## Implementation Priority

### Phase 1 - Critical (Deploy Immediately)
1. ✅ Notification by userId + isRead (DONE)
2. Bet by status (home screen)
3. Participant by betId (bet operations)
4. Transaction by userId (transaction history)
5. Transaction by status (admin dashboard)

### Phase 2 - High Value
6. PaymentMethod by userId
7. BetInvitation by toUserId + status
8. EventCheckIn by userId + isActive

### Phase 3 - Nice to Have
9. Dispute indexes (multiple)
10. TrustScoreHistory by userId
11. LiveEvent by status + scheduledTime
12. NotificationPreferences restructure

---

## Estimated Impact

**Current State:**
- Home screen: 500-2000ms (scans all bets)
- Transaction history: 300-1000ms (scans all transactions)
- Bet joins: 200-800ms (scans all participants)

**After Phase 1 GSIs:**
- Home screen: 50-200ms (10x faster)
- Transaction history: 30-100ms (10x faster)
- Bet joins: 20-80ms (10x faster)

**Cost Savings:**
- ~70% reduction in read capacity units
- ~80% reduction in query latency
- Better user experience at scale

---

## Next Steps

1. Review and prioritize which indexes to add
2. Update `amplify/data/resource.ts` with GSI definitions
3. Update service layer to use new query methods
4. Deploy schema changes (DynamoDB will backfill automatically)
5. Monitor performance improvements

---

## Notes

- Each GSI incurs storage cost (duplicate data)
- Each GSI supports different query patterns
- Composite sort keys (e.g., `['isActive', 'createdAt']`) allow range queries
- GSI backfill is automatic but takes time (seconds to minutes depending on data volume)
