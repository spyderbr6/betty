# Betting Squares

A squares game is a 10x10 grid attached to a live sporting event. Players buy
individual squares; winners are decided at the end of each period by the last
digit of each team's score. Everything after purchase is automated — no manual
resolution.

This replaces two earlier documents that described the work as it was being
planned (`BETTING_SQUARES_IMPLEMENTATION_PLAN.md` and
`SQUARES_INVITATION_IMPLEMENTATION.md`, now in `docs/archive/`). Both were
written before the feature shipped and their phase checklists no longer reflect
reality.

## How a game runs

**1. Creation.** A creator picks an ESPN event, a price per square, and how the
pot splits across the four periods. The split is a percentage per period that
must total 100; the UI defaults to 15 / 25 / 15 / 45, weighting the final score
most heavily. Games are private by default.

**2. Buying.** Players buy squares at `pricePerSquare`. Each purchase records the
grid position. `squaresSold` and `totalPot` are denormalised onto the game so
list views do not have to count purchases.

**3. Locking.** At `locksAt` the scheduled checker locks the grid and only then
assigns numbers: two independent shuffles of 0–9, stored as `rowNumbers` and
`colNumbers`, with `numbersAssigned` flipped true.

   Assigning numbers *after* sales close is the point. Nobody can pick a square
   knowing which digits it will carry, so every square is equally valuable at
   purchase time.

   A game that has not sold enough squares by `locksAt` is cancelled and the
   creator is notified.

**4. Resolution.** At the end of each period the checker takes the last digit of
each team's score and looks up the owner:

```
col = colNumbers.indexOf(awayScore % 10)
row = rowNumbers.indexOf(homeScore % 10)
```

   The purchase at that position wins that period's share of the pot. If nobody
   bought that square the period is recorded as a house win — a payout row is
   still written, so the outcome is auditable rather than silently dropped.

## Data model

| Model | Holds |
| --- | --- |
| `SquaresGame` | Grid state: `eventId`, `pricePerSquare`, `payoutStructure` (JSON), `rowNumbers` / `colNumbers`, `numbersAssigned`, `locksAt`, denormalised `squaresSold` and `totalPot` |
| `SquaresPurchase` | One bought square: owner, position, price |
| `SquaresPayout` | One period's result, including house wins |
| `SquaresInvitation` | Invite to a private game; mirrors `BetInvitation` |

## Automation

`amplify/functions/scheduled-squares-checker` runs on an EventBridge schedule and
owns the whole lifecycle: locking grids, assigning numbers, cancelling
under-sold games, and paying out each period as scores arrive. Live scores come
from `live-score-updater`, which polls the ESPN API.

Because the checker is scheduled rather than event-driven, resolution lags the
real-world period end by up to one interval. That is expected.

## Client code

| Path | Role |
| --- | --- |
| `src/components/betting/CreateSquaresForm.tsx` | Creation, including the payout split that must total 100 |
| `src/components/betting/SquaresGrid.tsx` | The 10x10 grid |
| `src/components/betting/SquaresGameCard.tsx` | List representation |
| `src/screens/SquaresGameDetailScreen.tsx` | Single game view |
| `src/services/squaresGameService.ts` | Queries and purchase flow |

State comes through `BetDataContext`, which exposes `mySquaresGames`,
`joinableSquaresGames`, `joinableFriendsSquaresGames` and `squaresInvitations`
alongside the equivalents for ordinary bets. Games load through the
`squaresGamesByStatus` GSI query — ACTIVE, LOCKED and LIVE are fetched
separately and merged.

## Testing

There is no automated coverage of squares. The e2e suite mocks
`squaresGamesByStatus`, `listSquaresPurchases` and `listSquaresInvitations` so
the app boots, but nothing asserts grid behaviour, number assignment or payout
maths. The winner lookup and the payout split are pure functions and would be
the obvious first unit tests if a runner is added.
