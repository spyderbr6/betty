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

`QUERY_OPTIMIZATION_AUDIT.md:427-430` says:

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

---

## Part 3 — Why the UI got complex

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

Fixing the data layer removes most of the UI complexity as a side effect. Don't
refactor the screen first.

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
| Correct the Friendship entry in `QUERY_OPTIMIZATION_AUDIT.md` | it is actively misleading |

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
