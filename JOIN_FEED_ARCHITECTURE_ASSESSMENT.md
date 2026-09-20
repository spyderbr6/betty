# Join Feed — Architecture Assessment & Scaling Plan

**Scope:** the "Join" tab (`src/screens/LiveEventsScreen.tsx`), its card
(`src/components/betting/BetCard.tsx`), and the data layer behind both
(`src/contexts/BetDataContext.tsx`, `amplify/data/resource.ts`).

**Date:** 2026-09-04
**Status:** assessment only — no code changed.

---

## TL;DR

The instinct is right, but the diagnosis needs adjusting. The problem is **not**
that DynamoDB can't express public / private / friends filtering. It is that the
app currently doesn't ask DynamoDB to do any of it. Every visibility rule is
applied in JavaScript, to a fixed-size window of rows that was fetched with no
regard for the rule.

That has three consequences, in increasing order of severity:

1. **Cost / latency** — the thing usually worried about. Real, but the least urgent.
2. **Silent wrongness** — filters that return incomplete results with no error.
   Several of these are live today, not hypothetical.
3. **Write races** — concurrent joins losing each other's updates. Independent of
   scale; happens at two simultaneous users.

The UI complexity in `LiveEventsScreen` is largely *downstream* of this. Because
the data layer hands the screen one undifferentiated bag of bets, the screen has
to do the segmenting itself, which is why the render tree is a pyramid of nested
ternaries over four orthogonal state axes.

---

## Part 1 — What the join page actually does today

### The read path

`BetDataContext.loadAllData()` fires 8 parallel queries on mount. Classified:

| # | Call | Access pattern | Verdict |
|---|------|----------------|---------|
| 1 | `Bet.betsByStatus({status:'ACTIVE'}, {limit:200})` | GSI Query | Indexed, but see **F1** |
| 2 | `Bet.betsByStatus({status:'PENDING_RESOLUTION'}, {limit:200})` | GSI Query | Indexed |
| 3-5 | `SquaresGame.squaresGamesByStatus` ×3 (ACTIVE/LOCKED/LIVE) | GSI Query | Indexed |
| 6 | `SquaresPurchase.list({filter:{userId}})` | **Scan** | `purchasesByBuyer` GSI *exists and is unused* |
| 7 | `SquaresInvitation.list({filter:{toUserId,status}})` | **Scan** | `squaresInvitationsByToUser` GSI *exists and is unused* |
| 8 | `BetInvitation.list({filter:{toUserId,status}})` | **Scan** | No GSI exists |
| 9 | `Friendship.list({filter:{user1Id}})` | **Scan** | No GSI exists |
| 10 | `Friendship.list({filter:{user2Id}})` | **Scan** | No GSI exists |

Then, per pending invitation, 2 more `.get()` calls to enrich (bet + fromUser).
Then `BetCard` fires one more `Participant.list({filter:{betId,userId}})` **per
card the user has joined** — also a Scan.

The visibility rules are then applied entirely client-side, in
`BetDataContext.tsx:657` (`joinableBets` memo):

```ts
if (bet.status !== 'ACTIVE') return false;
if (bet.creatorId === user.userId) return false;
if ((bet.participantUserIds || []).includes(user.userId)) return false;
if (bet.isPrivate && !invitedBetIds.has(bet.id)) return false;
```

and the friends view is a second client-side pass:
`joinableBets.filter(bet => friendIds.has(bet.creatorId))`.

### The write path

`BetCard.confirmJoinBet()` (line 238) does its own join: check participation →
check balance → create Participant → record transaction → **read-modify-write**
the Bet row:

```ts
await client.models.Bet.update({
  id: bet.id,
  totalPot: (bet.totalPot || 0) + amount,
  sideACount: (bet.sideACount || 0) + (side === 'A' ? 1 : 0),
  participantUserIds: [...(bet.participantUserIds || []), user.userId],
});
```

`BetDataContext` *also* exports a `joinBet` that does nearly the same thing with
optimistic updates layered on. **No screen consumes it.** Two implementations,
one dead. `CLAUDE.md` documents the dead one as the live one.

---

## Part 2 — Findings

Ordered by "how likely is this to bite you, and how loudly."

### F1 — The join feed shows the 200 **oldest** active bets 🔴

`betsByStatus` is a Query against a GSI whose sort key is `createdAt`. No
`sortDirection` is passed:

```ts
client.models.Bet.betsByStatus({ status: 'ACTIVE' as any }, { limit: 200 })
```

DynamoDB's `ScanIndexForward` defaults to **true** — ascending. So `limit: 200`
returns the 200 oldest ACTIVE bets. The context then sorts them newest-first in
JS, so the list *looks* correctly ordered and the bug is invisible until there
are more than 200 concurrent ACTIVE bets — at which point **every newly created
bet is unreachable from the Join page**, permanently, until older ones resolve.

Corroborating: `bulkLoadingService.ts:171` has `// sortDirection: 'DESC'`
commented out. The original audit doc recommended it. It was dropped on the
rewrite.

*This is the single highest-severity item and it is a two-word fix.*

### F2 — `Friendship` and `BetInvitation` have no GSI; their queries are Scans 🔴

*Verified directly against the current `amplify/data/resource.ts`, not inferred
from the audit doc — see [Appendix A](#appendix-a--audit-verification) for the
full index inventory and what the 2025 audit actually delivered.*

`QUERY_OPTIMIZATION_AUDIT.md:427-430` still says, in the file as it stands today:

> **14. Friendship Queries** — Status: Already using indexes properly (belongsTo
> creates GSI). Decision: No changes needed ✅

This is the load-bearing wrong assumption in the current design. `hasMany` /
`belongsTo` **does** create a backing index on the child table, but it is only
reachable through the *relational field* (`user.friendshipsAsUser1()`). Calling
`Friendship.list({ filter: { user1Id: { eq: X } } })` ignores it entirely and
issues a `Scan`.

The repo already documents this exact failure mode, in the comment on the
`stripeCustomerId` index (`amplify/data/resource.ts:81-84`):

> Without this the lookup is a filtered Scan, which only examines the first page
> of the table and silently misses users beyond it.

That is precisely what is happening to `Friendship` — on the query that decides
who your friends are, which gates the entire "Friends" view of the join page.

**Why this is urgent, not eventual:** a filtered Scan applies `limit` to rows
*examined*, not rows *returned*, and Amplify's default limit is 100. Once the
Friendship table exceeds ~100 rows platform-wide, a user's friend list is drawn
from an arbitrary 100-row slice of the table. The Friends tab does not error —
it just quietly shows fewer friends' bets, or none. At ~50 users with a couple of
friends each, this is already in range.

`BetInvitation` has the same shape, gating private-bet visibility.

`SquaresPurchase` and `SquaresInvitation` are the same call pattern but **their
GSIs already exist** (`purchasesByBuyer`, `squaresInvitationsByToUser`) — the code
just doesn't call them. Free fix.

### F3 — Zero pagination anywhere in the app 🔴

```
$ grep -rn "nextToken" src/ | wc -l
0
```

Every list in the codebase reads exactly one page and discards `nextToken`.
Combined with F2, a filtered Scan that returns 0 matching rows plus a
continuation token is indistinguishable, to this app, from "there are none."

This is the structural reason the scan problem is *silent* rather than slow. Fix
the indexes without fixing pagination and you convert silent-wrong into
silently-truncated.

### F4 — The friends filter is an intersection of two truncated sets 🔴

`joinableFriendsBets = joinableBets.filter(b => friendIds.has(b.creatorId))`

where `joinableBets` is bounded by F1 (200 oldest active bets) and `friendIds` is
bounded by F2 (whatever a 100-row scan happened to surface). The Friends view is
therefore the intersection of two independently-wrong sets. A friend's brand-new
bet has to survive both truncations to appear.

This is almost certainly the source of any "my friend made a bet and I can't see
it" reports.

### F5 — Concurrent joins lose each other's writes 🟠

The join path does read-modify-write on `participantUserIds`, `sideACount`,
`sideBCount`, `totalPot`. Two users joining the same bet within the same
round-trip both read the pre-join array and both write their own version. One
join disappears from the counts, and the pot under-reports — while the
`Participant` row and the balance deduction both persist. The user is charged
and not counted.

Needs `ADD` / `list_append` (atomic in DynamoDB) or a `TransactWriteItems` in a
Lambda resolver, plus a conditional write. Unrelated to scale — reproducible with
two phones.

### F6 — `isPrivate` is enforced only in the client 🟠 (security)

```ts
allow.authenticated().to(['read', 'create', 'update'])   // on Bet
```

Any authenticated user can read any bet, including private ones, straight from
the API. The `isPrivate && !invitedBetIds.has(...)` check lives in a `useMemo`.
Private bets are hidden from the UI, not from the data layer. Same on
`SquaresGame` (which, note, defaults `isPrivate: true` while `Bet` defaults
`false` — worth reconciling deliberately).

### F7 — Unfiltered subscription fan-out 🟠

All 11 subscriptions are unfiltered:

```ts
client.models.Bet.onCreate().subscribe(...)   // every bet, platform-wide
```

Every connected device receives every bet, squares game, friendship and purchase
event created by anyone, and discards ~all of them in the `next` handler. AppSync
bills per message delivered, so cost is O(users × global write rate) — quadratic
in DAU if activity scales with users. On mobile it's also a battery and
background-data problem.

A discovery feed does not need to be realtime. The user's *own* bets and
invitations do.

### F8 — Client-side aggregates that pagination will falsify 🟡

The BETTING STATS block computes TOTAL AVAILABLE POT / ACTIVE BETTORS / BETS
AVAILABLE by reducing over the loaded array, and the subtitle reads
`{liveBets.length} available to join`. These are presented as platform figures
but are actually "sum over whatever happened to load." The moment paging is
introduced they become confidently wrong. They should come from a server-side
counter or be reframed as page-local.

### F9 — Hot partition on `betsByStatus` 🟡

`index('status')` partitions on a field with ~7 possible values. Every ACTIVE bet
in the platform lives in one partition key, capped at 3,000 RCU / 1,000 WCU and
10GB. The join feed reads that one key on every app open. This is the textbook
low-cardinality-partition-key anti-pattern. It is fine at current volume and will
throttle before it fills.

### F10 — N+1 enrichment 🟡

Per pending invitation: 2 `.get()` calls. Per joined `BetCard`: 1 Scan to find
out which side you're on — data that could simply be denormalized onto the bet
alongside `participantUserIds`.

### F11 — Three GSIs are provisioned and never called 🟡

| Index | Call sites in `src/` |
|-------|----------------------|
| `Participant.participantsByUser` | 0 |
| `SquaresPurchase.purchasesByBuyer` | 0 |
| `SquaresInvitation.squaresInvitationsByToUser` | 0 |

Every GSI costs storage plus write amplification on every write to its base
table. These three are being paid for and returning nothing — while the code
paths they were built for (`BetDataContext.tsx:181-182`,
`DetailedStatsScreen`, `BettingHistoryScreen`) still Scan. Two of them are the
Phase 0 free wins below.

---

## Part 3 — Why the UI got complex, and why it should be fixed *last*

**To be clear up front: the UI work is necessary, not wasted. This is a claim
about ordering, not value.**

`LiveEventsScreen` is 859 lines; `BetCard` is 1203; `BetDataContext` is 1130.

The screen carries four orthogonal state axes — `contentType` (bets|squares) ×
`viewMode` (friends|all) × `searchQuery` × loading/empty — and resolves them in a
single nested ternary chain that is ~120 lines deep, with four distinct
empty-state copy variants inlined at the bottom of it.

The root cause is architectural, not stylistic: **the data layer returns one bag
of everything and the screen does the segmenting.** `viewMode` is not a query —
it's an array selection between two pre-computed memos. Search is a third
client-side pass. So all the branching has to live in JSX.

`BetCard` compounds it by being simultaneously a presentational card, a join
transaction orchestrator, a participant fetcher, a dispute-modal host, and a
resolution-acceptance widget — used across three screens in different modes,
which is why it needs to fetch its own data and why it grew a second join
implementation.

### Why order matters here

The screen's complexity is *load-bearing against the current data shape*. Two
concrete examples:

- `viewMode` is not a query. It is
  `liveBets = viewMode === 'friends' ? joinableFriendsBets : joinableBets` —
  a selection between two arrays, both derived client-side from the same bag.
- Search is a third client-side `.filter()` pass layered on top of that.

So every one of the four axes has to be resolved in JSX. There is nowhere else
for the branching to go.

If you refactor that JSX **today**, you build a clean abstraction over
`joinableBets` / `joinableFriendsBets` — and that abstraction bakes in three
assumptions that Phase 1 invalidates:

| Assumption in today's UI | After Phase 1 |
|---|---|
| The complete result set is in memory | It's a page + `nextToken` |
| `.length` is a meaningful total | It's "however many loaded so far" |
| Search can run locally over the array | It runs server-side or is page-scoped |

You would then redo it. Do the data layer first and the same refactor is
*smaller*, because roughly a third of the current branching stops existing:
`viewMode` collapses into a query parameter, search moves off the client, and
the stats block gets real server counts instead of a `reduce`.

### What in the UI is safe to do at any time

Not everything is order-dependent. These are independent of the data layer:

- Splitting `BetCard`'s join orchestration out of the presentational card. That
  is a separation-of-concerns fix, not a data-shape fix. **Caveat:** resolve the
  duplicate join implementation first (Phase 0), or you risk extracting the
  wrong one into a shared hook.
- Empty-state copy moved from four inlined ternary branches into a lookup table.
- Any design-system / `MODAL_STANDARDS.md` conformance cleanup.

### Suggested order

`Phase 0` (hours) → `BetCard` join dedup → `Phase 1` data layer → screen
refactor. The screen refactor is genuinely worth doing; it is just cheaper and
lands in a better shape after the data layer moves.

---

## Part 4 — The plan

Design principle: **in DynamoDB you build the index around the query, not the
query around the table.** Public, friends, and invited-private are three
different access patterns. Each gets its own key. None of them should require the
client to filter.

### Phase 0 — Stop the bleeding (hours, no schema change)

| Fix | Where |
|-----|-------|
| Add `sortDirection: 'DESC'` to both `betsByStatus` calls | `BetDataContext.tsx:172-173` |
| Same for the three `squaresGamesByStatus` calls | `BetDataContext.tsx:175-177` |
| Switch `SquaresPurchase.list(filter)` → `purchasesByBuyer({userId})` | `BetDataContext.tsx:181` |
| Switch `SquaresInvitation.list(filter)` → `squaresInvitationsByToUser({toUserId})` | `BetDataContext.tsx:182` |
| Delete the dead `joinBet` in the context, or wire `BetCard` to it and delete `BetCard`'s copy | pick one — do not keep both |
| Switch the `betId`+`userId` participant lookup to `participantsByBet` | `BetCard.tsx:110`, `BetCard.tsx:246`, `BetDataContext.tsx:754` |
| Correct item 14 in `QUERY_OPTIMIZATION_AUDIT.md`; mark P2/P3 items as still open | see Appendix A — the doc reads as more complete than it is |

F1 alone is arguably the highest value-per-character change in the repo.

### Phase 1 — Make the three visibility rules server-side queries (days)

**1a. Friend set → denormalize onto `User`.**
Add `friendIds: a.string().array()` to `User`, maintained on friendship
create/delete. One `User.get` replaces two Scans, and it removes the same pair of
Scans from the five *other* call sites that currently do it
(`FriendsScreen`, `CreateBetScreen`, `BetInviteModal`, `SquaresInviteModal`,
`CreateSquaresForm`). Same pattern already used for `participantUserIds`.
Cap ~10k ids (400KB item limit). Keep the `Friendship` rows as source of truth
and treat the array as a cache; add explicit `friendshipsByUser1/2` GSIs for
reconciliation and backfill.

**1b. Invitations → add the missing GSI.**
```ts
BetInvitation.secondaryIndexes(i => [
  i('toUserId').sortKeys(['createdAt']).queryField('betInvitationsByToUser')
])
```
"Private bets I can see" becomes one Query + a bounded batch-get.

**1c. Public feed → a sparse, sharded feed key.**
Add to `Bet` a `feedKey` written **only when `isPrivate === false`**:
`feedKey = "OPEN#<shard 0..9>"`, sort key `deadline`.

```ts
index('feedKey').sortKeys(['deadline']).queryField('openBetsFeed')
```

This does three jobs at once:
- **Sparse index = privacy enforcement.** Private bets have no `feedKey`, so
  they are not *in* the public index. No filter needed, and no way for a client
  bug to leak one into the feed.
- **Sharding fixes F9.** 10 shards → 30k RCU headroom. Query all 10 in parallel
  and merge; the merge is trivial because they share a sort key.
- **`deadline` as sort key** lets `deadline > now` be a *key condition*, so
  expired bets are excluded by the database rather than by a `useMemo` — and
  "closing soonest" is probably the better product sort for a join page anyway.

**1d. Friends feed → `betsByCreator`, fan-out on read.**
```ts
index('creatorId').sortKeys(['createdAt']).queryField('betsByCreator')
```
For F friends, F parallel bounded queries, merged. Correct by construction — no
intersection-of-truncated-sets. Fine to ~50 friends. Put it behind a
`feedService` module so the eventual swap to write-time fan-out (a `FeedEntry`
table, PK `userId`, written by a DynamoDB stream on bet create) is a one-file
change that never touches the UI. **Do not build the fan-out table yet** — the
friend counts here don't justify it, and it's the expensive, hard-to-reverse
option.

**1e. Pagination.** `nextToken` plumbed through `feedService` → context →
infinite scroll. Non-optional; everything above assumes it. Re-frame or
server-source the stats block (F8) at the same time.

### Phase 2 — Write-path correctness (days)

Move join into a single custom mutation backed by Lambda doing one
`TransactWriteItems`:

- `Participant` create, condition `attribute_not_exists` — and change its primary
  key to `betId#userId` so double-join is impossible by construction
- `Bet` update using `ADD sideACount 1` and `SET participantUserIds = list_append(...)` — atomic, fixes F5
- `User` balance decrement, condition `balance >= amount` — fixes the balance race
- `Transaction` create

One network call instead of five, atomic, and it deletes the entire
compensating-rollback path from `BetCard`.

While there: denormalize the joined side (e.g. `sideAUserIds` / `sideBUserIds`,
or a JSON participant array) so `BetCard` never queries — kills F10 and one Scan
per card.

### Phase 3 — Subscriptions & UI (days)

- Scope subscriptions with server-side filters to what the user actually needs
  (their bets, their invitations). Drop the global `Bet.onCreate` for the
  discovery feed — poll/refresh is correct there. Directly addresses F7.
- Tighten `Bet` / `SquaresGame` auth so a private bet isn't readable by id
  (F6). Reconcile the `isPrivate` default asymmetry between the two models.
- **Then** refactor the UI, once the data layer supports it:
  - `useJoinFeed({ contentType, scope, query })` → one hook, one query, returns a
    discriminated union state. `viewMode` becomes a *query parameter*, not an
    array selection.
  - `<FeedList>` switches on that union — one branch per state, no nested
    ternaries, empty-state copy in a lookup table.
  - Split `BetCard` into a pure presentational card + a `useJoinBet` hook. Target
    ~300 lines.
  - Push search server-side or debounce it against the paged result set; a
    client-side `.filter()` over page 1 is misleading once paging exists.

---

## Sequencing note

Phases 0 and 1 are the ones that matter. Phase 0 is nearly free and fixes a live
correctness bug. Phase 1 is what actually answers the scaling question, and it
does so without leaving DynamoDB — the document/relational framing isn't the
constraint here, the missing indexes are.

Phase 3's UI work should come **last**, not first. Most of the complexity in
`LiveEventsScreen` exists to compensate for the data layer; fix the data layer
and a lot of it deletes itself.

---

## Appendix A — Audit verification

`QUERY_OPTIMIZATION_AUDIT.md` (dated 2025-12-13) is **substantially
implemented** — its Phase 1 shipped in full. It is not stale advice that was
ignored. But the specific items this assessment depends on sit in its Phase 2
and Phase 3, which did not ship.

Verified against `amplify/data/resource.ts` at `6653676`, and against call sites
in `src/`. "Index" = the GSI exists in the schema. "Used" = code actually calls
the `queryField` rather than `.list({filter})`.

### The audit's own phasing, scored

| # | Audit item | Priority | Index | Used | Status |
|---|-----------|----------|-------|------|--------|
| 1 | Notification by userId | P1 | ✅ | ✅ | **Done** |
| 2 | Bet by status | P1 | ✅ | ✅ | **Done** — but see F1 (no `sortDirection`) |
| 3 | Participant by betId | P1 | ✅ | ✅ (10 sites) | **Done** — but the `betId`+`userId` lookup still Scans |
| 4 | Transaction by userId | P1 | ✅ | ✅ | **Done** |
| 5 | Transaction by status | P1 | ✅ | ✅ | **Done** |
| 6 | PaymentMethod by userId | P2 | ❌ | — | **Not done** (`paymentMethodService.ts:123` Scans) |
| 7 | BetInvitation by toUserId | P2 | ❌ | — | **Not done** ← gates private-bet visibility |
| 8 | EventCheckIn by userId | P2 | ❌ | — | **Not done** (`eventService.ts:70` Scans) |
| 9 | Dispute indexes | P3 | ❌ | — | **Not done** (6 Scan sites) |
| 10 | TrustScoreHistory by userId | P3 | ❌ | — | **Not done** |
| 11 | LiveEvent by status + time | P3 | ✅ | ✅ | **Done** (3 indexes) |
| 12 | NotificationPreferences | P3 | ✅ | ✅ | **Addressed** via GSI, not the PK restructure the audit suggested |
| 13 | Notification cleanup | Low | n/a | n/a | Correctly left alone |
| 14 | **Friendship** | Low | ❌ | — | **Verdict is wrong** — see below |

**Read: Phase 1 = 5/5 shipped. Phase 2 = 0/3. Phase 3 = 2/4.**

### Indexes added *since* the audit, which it does not cover

`usersByStripeCustomerId`, `transactionsByStripePaymentIntentId`,
`pushTokensByUser`, and the entire Squares family (`squaresGamesByStatus`,
`squaresGamesByEvent`, `squaresGamesByCreator`, `purchasesBySquaresGame`,
`purchasesByBuyer`, `payoutsBySquaresGame`, `payoutsByUser`,
`squaresInvitationsByToUser`, `squaresInvitationsByGame`,
`squaresInvitationsByFromUser`). The indexing discipline clearly improved after
the audit — which is what makes the two gaps below stand out rather than read as
general neglect.

### Models with no secondary index at all, today

`Evidence`, `Dispute`, `TrustScoreHistory`, `UserStats`, `FriendRequest`,
**`Friendship`**, **`BetInvitation`**, `PaymentMethod`, `EventCheckIn`.

Every `.list({filter})` against these is a Scan. The two in bold are on the join
page's critical path.

### On item 14 specifically

Item 14's "Already using indexes properly (belongsTo creates GSI) — No changes
needed ✅" is the one *incorrect* verdict in the audit, as opposed to merely
unimplemented. The reasoning is half-right: `hasMany`/`belongsTo` does create a
backing index on the child table. But it is only reachable through the parent's
relational field — `user.friendshipsAsUser1()` — and no code path uses that.
All six `Friendship.list({filter})` call sites Scan.

This matters more than its "Low priority" label suggests, because it is the
query that resolves who your friends are, and it therefore gates the entire
Friends view of the join page (F4).

### Bearing on this assessment

Findings F1, F3, F5, F6, F7, F8, F9, F10 and F11 were derived from reading the
current code and schema; none depend on the audit. F2 and F4 cite the audit only
to flag item 14's verdict as wrong — a claim about text still present in the
file, quoted verbatim, and independently confirmed by the index inventory above.

The assessment stands. The framing in the original draft undersold what the
audit accomplished, and this appendix corrects that.

---

## Appendix B — Two product scenarios, tested against the plan

Both scenarios were checked against the current schema and call sites. One of
them changes a recommendation made in Part 4; the other is blocked by something
that isn't a query problem at all.

### Scenario 1 — Friends only, all item types, invite-only hidden

Three requirements that look similar but decompose very differently:

| Requirement | Difficulty | Why |
|---|---|---|
| Hide invite-only | **Free** | Encode it in the index; see below |
| Friends only | **Moderate** | "My friends" is an arbitrary per-user set with no natural partition key |
| Regardless of item type | **Hard** | Requires merging two tables into one sorted, paginated stream |

#### The UI half is a clear win

Dropping the `viewMode` toggle (always friends) and the `contentType` toggle
(unified list) removes two of the four state axes identified in Part 3. The
nested ternary chain collapses to a single list with one loading state and one
empty state. This is the simplification you're after, and it's real.

It needs a discriminated union at the item level:

```ts
type FeedItem =
  | { kind: 'bet';     item: Bet }
  | { kind: 'squares'; item: SquaresGame };
```

and a `<FeedCard>` that switches once, over a shared card shell. Today `BetCard`
and `SquaresGameCard` share no structure, so that shell has to be factored out.

#### The data half gets *harder*, and it changes the Part 4 recommendation

Part 4 (1d) proposed fan-out-on-read — `betsByCreator`, one query per friend —
and explicitly said **not** to build a write-time fan-out table yet. **Scenario 1
invalidates that.**

With fan-out-on-read across two types you have `F friends × 2 tables = 2F`
independently-sorted streams to merge. Merging N sorted streams *with
pagination* requires a cursor holding N positions: `nextToken` becomes a blob of
2F tokens, and every "load more" has to re-query streams that may not advance.
This is precisely the problem write-time fan-out exists to solve, and it is not
worth hand-rolling.

**Revised recommendation for this scenario: a single `FeedItem` table.**

```
PK   audienceUserId
SK   createdAt#itemId
     itemType   'BET' | 'SQUARES'
     itemId
     creatorId
     source     'FRIEND' | 'INVITE'
     + slow-changing display fields (title, betAmount, side names)
```

Written by a Lambda on the DynamoDB stream from `Bet` and `SquaresGame`, one row
per friend of the creator. One query returns both types, already interleaved,
already sorted, trivially paginated.

The visibility rules then become **write-time decisions made once**, rather than
read-time decisions re-derived on every client:

- **Fan out only when `isPrivate === false`.** "Invite-only doesn't show" is
  structural — private items are never in anyone's feed, so there is no filter
  to forget.
- **Private items reach their audience through a second trigger:** on
  `BetInvitation` / `SquaresInvitation` create, write one `FeedItem` for that
  user with `source: 'INVITE'`. If you later want invited items visible here,
  they already are; if not, filter on `source` — over a complete set, not a
  truncated one.

Net: the feed is one query, complete, correct, sorted, paginated, with **zero**
client-side visibility logic.

**Honest costs.** W writes per item, where W = creator's friend count. Bounded —
friend graphs here are mutual and capped, so there's no celebrity fan-out
problem. But: denormalized display fields go stale (store only slow-changing
ones and fetch live counts for the visible page); existing data needs backfill;
unfriending requires either deleting rows or a cheap read-time filter against
the in-memory `friendIds`. It is the expensive, hard-to-reverse option — only
build it if the unscoped friends feed is genuinely the product direction.

#### Cheaper interim, if you want Scenario 1 without committing

Dropping the "All" view means the working set is *only* friends' items. If
typical friend counts are under ~50 and you accept a bounded window
(`createdAt > now - 7d`) instead of true infinite scroll, fan-out-on-read works:
2F bounded queries, merged in memory, **no pagination cursor needed because the
window is bounded rather than paged.** Ship that, measure real friend counts and
item volume, upgrade to the feed table only if the numbers demand it.

#### A gap this exposed in Part 4

Plain `betsByCreator` returns a creator's private bets too, which the client
would then have to filter out — reintroducing fetch-then-filter at smaller
scale. Whichever path you take, the creator index must be **sparse**:

```ts
// written at create/update time: creatorId when public, attribute absent when private
publicCreatorKey: a.string(),
index('publicCreatorKey').sortKeys(['createdAt']).queryField('publicBetsByCreator')
```

Same principle as the `feedKey` in Phase 1c: **derive the index attribute at
write time so the index itself encodes the visibility predicate.**

---

### Scenario 2 — Same, but only friends checked into the same event

#### Blocker: bets have no event

`Bet.eventId` exists in the schema (`resource.ts:250`) and **is never written.**
`CreateBetScreen.tsx:387` omits it from the `Bet.create` payload entirely. The
event picker in that screen is gated behind `selectedTemplate === 'squares'`
(line 698), so `selectedEvent` only ever reaches `SquaresGameService.createSquaresGame`
(line 557). Confirmed: no code path anywhere writes `eventId` on a `Bet`.

So today this filter returns empty by construction, for every bet. This is a
**data-capture** change, not a query change, and it has to come first.

Two ways to fix it, and the second is nicer:

1. Add event selection to the standard bet form — more UI, which cuts against
   the goal of simplifying.
2. **Infer it.** If the creator has an active check-in when they create a bet,
   stamp that `eventId` automatically. Zero added UI, and it makes "bets at this
   game" populate itself from behaviour you already capture.

#### Once that's fixed, this is *easier* than Scenario 1

Counterintuitive but important: **adding the event constraint makes the query
cheaper, not more expensive.**

"My friends" is an arbitrary, unbounded, per-user set with no natural partition
key — that is what forces fan-out. "Checked into event E" is a small, shared,
**natural partition**. One event is one partition and a bounded candidate set.

Query plan:

| Step | Query | Count |
|---|---|---|
| 1 | `checkInsByUser(me, isActive)` → my event(s), typically 1 | 1 |
| 2 | `betsByEvent(E)` + `squaresGamesByEvent(E)` → everything on that event | 2 |
| 3 | Intersect creators with `friendIds` — already in memory from Phase 1a | 0 |
| 4 | *(optional)* `checkInsByEvent(E)` to require the creator be *currently* present — also gives you "who's here" for the UI | 1 |

**3–4 queries, constant, independent of friend count.** No feed table, no merge
cursor, and the cross-type merge is trivial because both lists are short and
scoped to one event.

#### On client-side filtering in step 3

Step 3 filters on the client, which this document has criticized elsewhere. The
distinction matters: **client-side filtering is fine over a bounded, complete
set; it is harmful over an arbitrarily-truncated one.** Scenario 2's candidate
set is one event's items, fetched whole. Today's join page filters over "the 200
bets that happened to load" (F1/F4). Same operation, opposite correctness.

Note also that "is the creator *still* checked in" is time-varying, so it must
be evaluated at read time — it cannot be baked into a feed row. Another reason
fan-out doesn't help here.

#### Indexes required

| Index | Status |
|---|---|
| `Bet.index('eventId').sortKeys(['createdAt'])` → `betsByEvent` | ❌ missing |
| `EventCheckIn.index('userId')` → `checkInsByUser` | ❌ missing (audit item 7, unshipped) |
| `EventCheckIn.index('eventId')` → `checkInsByEvent` | ❌ missing |
| `SquaresGame.squaresGamesByEvent` | ✅ exists |

#### Related finding: `EventCheckIn` is the fastest-growing table and has zero indexes

`getUserCheckedInEvent()` (`eventService.ts:70`) — the function this entire
scenario pivots on, and the one behind the check-in banner — is a **Scan**:

```ts
client.models.EventCheckIn.list({
  filter: { userId: { eq: userId }, isActive: { eq: true } }
})
```

`EventCheckIn` grows as *users × events attended*, faster than any other table
here, and has no secondary index at all. This is the same silent-truncation
failure mode as `Friendship` (F2): past the scan window the app will conclude
you are not checked in, with no error. It then takes `checkIns[0]` from an
unordered scan result — if a stale active check-in exists, which one you get is
arbitrary.

#### Bonus: Scenario 2 fixes F8 for free

The BETTING STATS block is currently "sum over whatever happened to load," and
Part 4 flagged that pagination would make it worse. Scoped to one event, those
aggregates are computed over a **complete bounded set** — so they become
correct and genuinely meaningful ("$1,240 in play at this game") for the first
time.

---

### Recommendation

**Build Scenario 2 first, even if Scenario 1 is the eventual goal.**

- It delivers the same UI simplification — one unified list, both toggles gone.
- It needs 3 indexes and one data-capture fix. No new infrastructure.
- Its result set is naturally small and more interesting than "everything my
  friends did lately."
- It defers the feed-table decision entirely, and buys you real numbers on
  friend counts and item volume to make that decision with.

The two also compose well: **Scenario 2 as the default view when you're checked
in, Scenario 1 as the fallback when you're not.** That shape means Scenario 1
only ever has to serve the un-checked-in case, which lowers the bar for it
considerably — quite possibly below the threshold where the fan-out table is
justified at all.
