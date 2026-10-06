# Money and Authorization Security Plan

Status (branch `money-security`): **steps 1 and 2 done; step 3 in progress** (3a-3e-1 done; see §7 for progress, what is left and how to resume
done). Written 2026-10-04 from a read of every write path; §1-§3 describe the code as it
was then. Decisions in §6: admins are a Cognito `admins` group (the owner's account only);
a minimum-version gate comes before locking the rules; Venmo deposits are deleted;
withdrawals reserve the amount when requested; no audit (no real users yet).

The working assumption was that the payout Lambda is the only thing writing balances.
It is not. Balances, transactions, payouts and admin approvals are written from users'
phones, and the data rules let any signed-in user write any of them for any user.

---

## 1. What is exposed today

The API's authorization rules (`amplify/data/resource.ts`) give **every signed-in user**
`update` on these models, for **every row**, not just their own:

| Model | What any user can change on anyone's row | Consequence |
|---|---|---|
| `User` (line 89) | `balance`, `role`, `subscriptionTier`/`Status`, `trustScore` | Set any balance. Make yourself `ADMIN`. Give yourself Pro. |
| `Transaction` (line 564) | create and update anything: `status`, `amount`, `actualAmount`, `userId` | Forge a pending payout; mark a withdrawal complete; edit history. |
| `Bet` (line 274) | `winningSide`, `status`, `totalPot`, `disputeWindowEndsAt` | Pick the winner of someone else's bet; inflate the pot. |
| `Participant` (line 308) | create and update: `payout`, `amount`, `side` | Join a bet without paying; change your side after the result. |
| `Dispute` (line 354) | `status` | Resolve any dispute in your own favour. |
| `SquaresGame`, `SquaresPurchase`, `SquaresPayout` | create and update | Same classes of problem for squares. |
| `TrustScoreHistory` (line 372) | create | Forge trust history. |

Admin is enforced **only on the device**: every admin check reads the `role` field
(`AdminDashboardScreen.tsx:69`, `transactionService.ts:459`, `disputeService.ts:302`, …).
Because `role` is writable by its owner, anyone can make themselves an admin and approve
their own deposits and withdrawals.

None of this needs a modified app: the GraphQL API accepts these writes from any signed-in
session.

## 2. Every place a balance or money record is written

### Server (Lambdas)

| Where | What | Trusted input? | Problems |
|---|---|---|---|
| `stripe-webhook/handler.ts:171` | Credits card deposits | Yes: Stripe-signed event, PENDING row written by `stripe-payment-intent` | Balance is read then written (lost update if another write lands in between). Two concurrent deliveries can both see PENDING. |
| `payout-processor/handler.ts:195` | Credits bet winnings after the 48h window | **No.** Credits `actualAmount` from whatever PENDING transactions point at the bet, which the creator's phone created (and which anyone can create, §1) | Finds them with a filtered `Transaction.list` that reads one page only, then marks the bet RESOLVED anyway, so at scale winners go unpaid. Overwrites `platformFee` with 3% even for Pro. Read-then-write balance. |
| `scheduled-bet-checker/handler.ts:125` | Refunds stakes on bets that expire with one side empty | Yes: computed from Participant rows | Read-then-write balance. Participant rows themselves are client-writable. |
| `scheduled-squares-checker/handler.ts:534, 761` | Squares period payouts and refunds | Mostly: computed from purchases | Read-then-write balance. Purchase rows are client-writable. |

### Client (users' phones)

| Where | What | Whose balance | Problems |
|---|---|---|---|
| `TransactionService.recordBetPlacement` ← `BetCard`, `CreateBetScreen`, `BetDataContext` | Debits the stake when joining or creating a bet | Own | Separate call from creating the Participant: skip it and you join for free. Read-then-write. |
| `ResolveScreen.tsx:340-383` | Sets winner, writes each Participant's payout, creates the PENDING `BET_WON` rows with amounts **computed on the creator's phone**, decides each winner's fee via `isProSubscriber` | **Others'** (via payout-processor) | Creator controls who is paid how much. |
| `TransactionService.recordBetLoss` ← `ResolveScreen.tsx:377` | $0 "loss" record, but goes through `createTransaction`, which **writes the loser's balance** with a value read moments earlier | **Others'** | Can overwrite a deposit or payout that lands at the same moment. |
| `squaresGameService.purchaseSquares` | Debits squares purchases | Own | Same separate-call problem as joins. |
| `squaresGameService.cancelSquaresGame` → `recordSquaresRefund` | Refunds every buyer when a creator cancels | **Others'** | Client decides refund amounts. |
| `TransactionService.updateTransactionStatus` ← `AdminDashboardScreen` | Approves deposits and withdrawals; writes the balance | **Others'** | "Admin" is a writable field (§1). |
| `TransactionService.createWithdrawal` ← `WithdrawFundsModal` | Creates a PENDING withdrawal, fee computed on the phone | Own (at approval) | Fee and Pro decided client-side. |
| `AdminTestingScreen.tsx:403` | Creates test users with $1000 | New user | Dev builds only, but the API permits it from any build. |

Dead code, to delete rather than secure: `TransactionService.createDeposit` (Venmo
deposits; no callers), `recordBetWinnings` and `recordBetCancellation` (no callers),
`ResolveScreen.updateUserStats` (never called), `squaresGameService.processPeriodScores`
(the Lambda does this), `BetDataContext.joinBet` (documented as dead in CLAUDE.md).

## 3. Correctness bugs found along the way

These are money bugs even without an attacker:

1. **An upheld dispute still pays the original winners.** `disputeService.ts` sets the bet
   back to PENDING_RESOLUTION on `RESOLVED_FOR_FILER` but leaves the PENDING payouts in
   place; once the dispute is no longer PENDING, `payout-processor` pays them.
2. **Payouts can be skipped at scale.** `payout-processor` finds pending transactions with a
   filtered Scan (`Transaction.list`), which returns one page, then marks the bet RESOLVED.
   Anything past that page is never paid. (`Transaction` has no index on `relatedBetId`.)
3. **Lost updates everywhere.** Every balance change is "read balance, add, write balance".
   Two changes to one user at the same moment (a payout and a join, a deposit and a refund)
   lose one of them. The client `recordBetLoss` path writes other users' balances this way
   at the moment of resolution.
4. **Recorded fees disagree with what was charged.** `payout-processor` stores a 3% fee on
   every `BET_WON` while crediting the client's `actualAmount`, so for Pro members the
   ledger shows a fee that was never taken.

## 4. Target design

**Rule: no client ever writes a money field or a money record.** Clients ask; the server
decides, validates, and applies.

### 4.1 One ledger module, applied atomically

A shared server module (`amplify/shared/ledger.ts`, logic unit-tested like `pushLogic.ts`)
is the only code that changes a balance. Each money movement is one DynamoDB
`TransactWriteItems` call that, all-or-nothing:

- adjusts `User.balance` with `ADD` (never read-then-write), with a condition
  `balance >= :debit` on debits so a balance can never go negative;
- writes the `Transaction` row with a deterministic id (e.g. `payout#<participantId>`,
  `stake#<participantId>`, `stripe#<paymentIntentId>`), conditioned on not existing, so a
  retry or a duplicate delivery is a no-op instead of a second credit;
- updates the related record's state with a condition on its current state (bet
  `PENDING_RESOLUTION` → `RESOLVED`, participant unpaid → paid).

This fixes lost updates, double credits and partial failures in one place.

### 4.2 Server functions replace client money writes

Custom mutations backed by Lambdas, each checking who is calling and what they are allowed
to do:

| Mutation | Replaces | Server checks |
|---|---|---|
| `joinBet(betId, side, amount)` | `BetCard.confirmJoinBet` + `recordBetPlacement` | Bet ACTIVE and not expired, caller not already in, amount matches the bet, private bets need an invitation or friendship. Creates the Participant and debits the stake in one transaction. |
| `createBet(...)` | `CreateBetScreen` create + creator stake | Same stake rules for the creator. |
| `resolveBet(betId, winningSide)` | `ResolveScreen` writes | Caller is the creator, bet past deadline and unresolved. **Server** computes payouts and fees (Pro looked up server-side) and writes the PENDING payouts. |
| `buySquares(gameId, squares)` | `purchaseSquares` | Squares free, game open, price from the game. |
| `cancelSquaresGame(gameId)` | client refunds | Caller is the creator, game cancellable; refunds from purchase rows. |
| `requestWithdrawal(amount, paymentMethodId)` | `createWithdrawal` | Verified method, sufficient balance; reserves the amount; fee server-side. |
| `adminDecideTransaction(id, approve, reason)` | `updateTransactionStatus` | Caller in the Cognito **admins** group. |
| `adminResolveDispute(id, outcome, notes)` | `disputeService.resolveDispute` | Admins group. Upheld: **cancels the pending payouts** and returns the bet for re-resolution (fixes §3.1). |
| `ensureMyUserRecord()` | client `User.create` in `ensureUserRecord` | Creates the caller's own row with balance 0; nothing else. |

`payout-processor` changes to: look payouts up through a new `transactionsByBet` index
(fixes §3.2), check each payout against the Participant and Bet rather than trusting the
row, and apply through the ledger.

### 4.3 Lock the data rules

Once nothing legitimate writes these from a client:

- **`User`**: owner may update profile fields only (display name, picture, privacy
  switches). `balance`, `role`, `subscription*`, `trustScore` and the stats fields get
  field-level rules: owner and friends read, server functions write.
- **`Transaction`, `SquaresPayout`, `TrustScoreHistory`**: owner read only. Server writes.
- **`Participant`, `SquaresPurchase`**: read for signed-in users; writes through the
  mutations only.
- **`Bet`, `SquaresGame`**: owner may create and edit non-money fields while open;
  `status`, `winningSide`, `totalPot`, counts and dispute fields are server-only.
- **`Dispute`**: participants create and read their own; status changes are admins-only.
- **Admin** becomes a Cognito group (`admins`) checked by the server. The `role` field
  stays for display, server-written.

## 5. Rollout

The order matters. Locking the rules first would break every phone in the field, because
the shipped app writes these records directly.

1. **Build alongside (no behaviour change).** Ledger module with unit tests; new index;
   mutations deployed but unused. Tested on the **sandbox stack only**
   (never `d22il7q25cxkh7`).
2. **Fix the money bugs in the Lambdas** (§3: upheld disputes, payout paging, fee record,
   atomic ledger in stripe-webhook, payout-processor, both checkers). These help the
   current app immediately and do not depend on clients.
3. **Move the app onto the mutations**, flow by flow (joins, create, resolve, squares,
   withdrawals, admin), each with e2e coverage and a sandbox run. Delete the dead paths.
4. **Ship that app build** (EAS) and add a **minimum-version gate**: the app checks a
   server-side minimum version on launch and asks old builds to update. Without it, step 5
   breaks money flows for anyone who has not updated.
5. **Lock the rules** (§4.3) once the minimum version is enforced.
6. **Audit.** Reconcile every balance against its ledger history and flag differences;
   list every `User` row whose `role` is not USER and every transaction not produced by a
   known flow. This tells us whether anything was abused before the fix.

Steps 1 and 2 are safe to start now. Steps 3–5 change behaviour users see and need your
go-ahead at each stage.

## 6. Decisions needed

1. **Admins as a Cognito group** (`admins`), replacing the `role` field for access?
   Recommended. Who should be in it today?
2. **Minimum-version gate** before locking the rules? Recommended; the alternative is
   breaking old builds at step 5.
3. **Venmo deposits** (`createDeposit`, admin-approved) are dead code; card deposits
   replaced them. Delete?
4. **Withdrawals**: reserve the amount when requested (balance drops immediately, restored
   if rejected) rather than at approval? Recommended: today each request only checks the
   current balance, so a user can open several that together exceed it, and the balance
   can be spent on bets while a withdrawal waits. Approval re-checks the balance
   (`transactionService.ts:617`), so the excess is refused then, but only then.
5. **The audit (step 6)**: run it against production read-only before or after the fix?
   Before tells you sooner whether anything has already been abused; it needs your
   production read credentials, and I will not touch production otherwise.

## 7. Progress and how to resume

Kept current so work can resume in a new session with nothing else. Branch
`money-security`, pushed after each step. Last updated 2026-10-06.

### Done (each sandbox-verified: unit tests, e2e, `scripts/sandbox-money-flows-check.mjs`)

| Step | What | Commit |
|---|---|---|
| 1 | Atomic ledger (`amplify/shared/ledgerLogic.ts`, `amplify/functions/money/`) | cc665fd |
| 2 | Stripe webhook, payout processor, both scheduled checkers on the ledger | 192e67a..8f456bb |
| 3a | `joinBet` | 092abea |
| 3b | `createBetWithStake` | fefa03f |
| 3c | `resolveBet`, `acceptBetResult`; `Bet.resolvedAt` | 7d8e277 |
| 3d | `buySquares`, `cancelSquaresGame`; grid locked server-side | 1d8d827 |
| fix | Squares final share pays once, on the final score incl. overtime | 73226ca |
| 3e-1 | Cognito `admins` group, `requestWithdrawal` (reserves), `adminDecideTransaction` | 475094e |

### Remaining

- **3e-2 disputes**: `adminResolveDispute` (admins group). Upheld: cancel the bet's
  PENDING `BET_WON` rows, clear `winningSide` (bet back to PENDING_RESOLUTION for the
  creator), trust changes as `disputeService.resolveDispute` does today. Dismissed /
  for creator: bet stays PENDING_RESOLUTION, payout proceeds. Client:
  `AdminDisputeScreen` -> mutation. Filing a dispute is not money; it stays client-side
  until step 5.
- **3f `ensureMyUserRecord`**: server creates the caller's own User row with balance 0.
  The client's `ensureUserRecord` (`src/services/userRecordService.ts` +
  `userRecordLogic.ts`) has a duplicate-creation guard the owner said exists "for a
  reason" (early duplicate-record problems): read it and its tests first and keep the
  same behaviour (get-then-create, same id = Cognito sub, same defaults).
- **3g delete dead money code**: `TransactionService.createDeposit` (Venmo),
  `recordBetPlacement`, `recordBetWinnings`, `recordBetCancellation`, `recordBetLoss`,
  `recordSquaresPurchase`, `recordSquaresRefund`, `recordSquaresPayout`,
  `createWithdrawal`, `updateTransactionStatus`, `createTransaction` if unused;
  `squaresGameService.processPeriodScores` (+ its private helpers);
  `ResolveScreen.updateUserStats`; `BetDataContext.joinBet` is already gone;
  `bulkLoadingService.ts` (documented dead). Grep for callers before each deletion.
- **Step 4**: ship an app build (owner runs EAS) + a minimum-version gate (server-side
  minimum version the app checks on launch, asking old builds to update).
- **Step 5**: lock the data rules (§4.3). Only after step 4 is enforced.
- Step 6 audit: skipped (no real users yet; owner's decision).

### Owner actions outstanding

- Add your account to the Cognito `admins` group: sandbox pool `us-east-2_zkNdt4Suq`
  now, production when this branch is released (Cognito console -> User pools -> Groups
  -> admins -> Add user; then sign out and in). Until then admin approve/reject/cancel
  are refused by the server. Do not release the branch without it.

### Decisions taken (owner)

Admins = Cognito `admins` group, the owner's account only. Minimum-version gate before
locking rules. Venmo deposits deleted (3g). Withdrawals reserve the amount at request.
No audit. Squares final share on the final score including overtime. Withdrawals do not
require a verified Venmo account (the admin checks the handle when approving).

### How the work is done (keep doing it this way)

- Each flow: pure tested module in `amplify/shared/` (decision + plan), a case in
  `amplify/functions/money/handler.ts`, a mutation in `amplify/data/resource.ts`
  (`allow.authenticated()`, the handler checks the caller), a client service + pure
  `*Logic.ts` with tests in `src/services/`, e2e spec, sandbox scenario.
- Prove tests can fail: break each rule, see exactly its test fail, restore.
- Deploy with `npx ampx sandbox --once` (never a watcher; never production
  `d22il7q25cxkh7`). Never edit source while a deploy is building: it bundles whatever is
  on disk (a break check once shipped to the sandbox this way).
- Run `SANDBOX_STACK=amplify-sidebet-Desktop-sandbox-a3098e7c95 node scripts/sandbox-money-flows-check.mjs`
  after each deploy; the app's custom mutations only exist for e2e after a deploy writes
  them into `amplify_outputs.json`.

### Gotchas learned

- AppSync stores AWSJSON as a DynamoDB map: direct ledger writes must store JSON fields
  as objects (text reads back double-encoded).
- Direct DynamoDB writes fire no subscriptions: touch the row through AppSync
  (`Model.update({ id })`), which fires `onUpdate`; BetDataContext upserts on onUpdate.
- `classifyCancellation` treats any failed condition on the Transaction table as
  `already_applied` (including state updates on that table).
- Amplify generates `createBet` etc.: custom mutations need other names.
- Windows shell: Git Bash `sed -i` turns CRLF files into LF (fine: autocrlf stores LF);
  never pass backtick text through `node -e "..."` (bash runs it); PowerShell 5.1 breaks
  commit messages with double quotes (use `git commit -F`).
- The `amplify-dev` profile cannot list Lambdas or read DynamoDB: find functions via the
  stack's nested `DescribeStackResources`; verify data through AppSync.

### Found and left for later (not money-security)

- A squares game LIVE whose event never finishes goes to PENDING_RESOLUTION after 2 days;
  with periods already paid it cannot be cancelled either (admin needs a way to settle
  it from the remaining scores).
- Trust: rejecting any deposit or withdrawal applies the -3.0 "fraud attempt" penalty
  (unchanged from the app's behaviour; a wrong Venmo handle is not fraud).
- `AdminTestingScreen` creates bets and $1000 users directly (dev builds; step 5 locks it).
