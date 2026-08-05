# Stripe Integration Guide

Card deposits and Pro subscriptions, end to end: what is implemented, how to configure
Stripe from test through production, and how to diagnose it when payments stop arriving.

**Status:** Card deposits are complete and working in production — balances credit
automatically via the webhook.

**Pro subscriptions have not yet been verified end to end.** The code path was broken by two
Stripe API changes (see [Subscriptions specifically](#subscriptions-specifically) under
Troubleshooting) and has been fixed but not exercised against a live Stripe account. Before
declaring it working, confirm: the `STRIPE_PRO_PRICE_ID` secret resolves in the mode you are
testing, `customer.subscription.*` deliveries succeed against the **API Gateway** endpoint,
and a test upgrade actually flips `User.subscriptionTier` to `PRO`.

---

## What's implemented
- **Card deposits via Stripe Payment Sheet** — replaces manual Venmo TX ID entry
  - `stripe-payment-intent` Lambda creates PaymentIntent, returns clientSecret
  - `AddFundsModal` replaced with 2-step Stripe flow (amount → Payment Sheet → success)
  - Card processing passed through at Stripe's cost (2.9% + $0.30, grossed up so
    the platform nets the full deposit), shown transparently before payment
- **Stripe webhook** Lambda updates Transaction + credits balance automatically
  - Exposed on **two** endpoints; configure Stripe against the API Gateway one (see Step 6).
    The Lambda Function URL returns 403 in this AWS account.
  - Handles: `payment_intent.succeeded`, `customer.subscription.*`
- **Pro subscription** ($4.99/month) via Stripe Billing
  - `stripe-manage` Lambda: creates subscription, returns clientSecret for Payment Sheet
  - Customer Portal via `createStripeManage({ action: 'customer_portal' })` — no custom cancel UI needed
  - Webhook handles subscription lifecycle (created, updated, deleted → User.subscriptionTier)
- **Fee restructure** — all rates centralized in `src/config/subscriptionConfig.ts`
  - Deposits: card processing at cost for everyone (Free and Pro alike) — this is
    Stripe's fee, not a platform margin. See `calculateDepositFee()`.
  - Free tier: 2% withdrawal, 3% winnings
  - Pro tier: 0% withdrawal, 0% winnings
- **AdminTestingScreen** gated behind `__DEV__` (removed from production builds)
- **Cross-platform payments** — card entry works on iOS, Android, *and* web
  - Native (iOS/Android): Stripe Payment Sheet via `@stripe/stripe-react-native` (requires an EAS build)
  - Web: Stripe Payment Element via `@stripe/stripe-js` + `@stripe/react-stripe-js`
  - `src/web/stripe-react-native.tsx` exposes the same `initPaymentSheet`/`presentPaymentSheet`
    API as the native SDK, so `AddFundsModal` and `SubscriptionScreen` are platform-agnostic.
    Metro swaps the implementation at build time (see `metro.config.js`).
  - Both platforms share one backend — same Lambdas, same `clientSecret`, same webhook.

## ⚙️ Setup Guide (Test → Production)

#### Understanding Test vs Live mode
Stripe has two completely separate environments. **Never mix keys across environments.**

| | Test mode | Live (Production) mode |
|---|---|---|
| Keys start with | `pk_test_` / `sk_test_` | `pk_live_` / `sk_live_` |
| Real money? | No — fake transactions only | Yes — real charges |
| Test card | `4242 4242 4242 4242` | Real cards only |
| Dashboard toggle | Top-right "Test mode" ON | Top-right "Test mode" OFF |

---

#### Step 1 — Create a Stripe account
Go to [stripe.com](https://stripe.com) → Sign up (or log in).
Make sure **Test mode** is ON (toggle in top-right of dashboard).

---

#### Step 2 — Get your API keys
**Stripe Dashboard → Developers → API Keys**

You need two keys per environment:
- **Publishable key** (`pk_test_...` or `pk_live_...`) — goes in `.env`, safe to expose in app bundle
- **Secret key** (`sk_test_...` or `sk_live_...`) — goes in Amplify env vars, NEVER committed to git

**For testing**: copy the `pk_test_...` and `sk_test_...` keys.
**For production**: switch the dashboard toggle to Live mode, copy the `pk_live_...` and `sk_live_...` keys.

---

#### Step 3 — Set the publishable key in `.env`
Open the `.env` file in the root of the project (not committed to git):
```
# For testing:
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE

# For production (swap when going live):
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY_HERE
```
This key is bundled into the app and used by StripeProvider in App.tsx.

---

#### Step 4 — Set backend values in Amplify **Secrets**

⚠️ **Amplify has two separate stores and they are NOT interchangeable:**
- **Secrets** — accessed in code via `secret('NAME')`. Encrypted, never written into the CloudFormation template.
- **Environment variables** — accessed in code via `process.env.NAME`. Plain text, baked into the template at build time.

The three Stripe Lambdas use `secret()`, so these values **must go in Secrets**, not Environment variables. Putting them in Environment variables makes them resolve to empty and every Stripe call fails with "Could not initialize payment."

**Where to set them**: AWS Amplify Console → [your app] → **Hosting → Secrets** → Manage secrets → pick your branch.

| Secret name | Where to get it | Test value | Production value |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks (after Step 6) | `whsec_...` | `whsec_...` |
| `STRIPE_PRO_PRICE_ID` | Stripe → Products (after Step 5) | `price_...` | `price_...` |

All three must exist or **the deployment will fail** with a "secret not found" error — that error is the fastest way to confirm a secret is missing or misnamed. Names are case-sensitive and must match exactly.

`STRIPE_PORTAL_RETURN_URL` is not a secret — it defaults to `sidebet://account` in code and only needs setting as a plain Environment variable if you want to override it.

⚠️ **Do not confuse the two Stripe URLs.** They point in opposite directions:

| | Direction | Where it goes | Correct value |
|---|---|---|---|
| **Webhook endpoint** (set in Stripe Dashboard → Webhooks) | Stripe's servers → your backend | The Lambda Function URL | `https://xxxx.lambda-url.<region>.on.aws/` |
| **`STRIPE_PORTAL_RETURN_URL`** | The user's browser → back to your app | Your app | `sidebet://account` |

Putting the Lambda URL in `STRIPE_PORTAL_RETURN_URL` drops users on a page that just says `OK` after they finish managing their subscription.

The app overrides this per platform anyway (see `openCustomerPortal()` in `src/services/stripeService.ts`): mobile uses the `sidebet://` deep link, web uses `window.location.origin`, because a browser cannot follow a custom scheme. The env var is only a fallback.

**For local sandbox development**, set secrets via the CLI instead:
```bash
npx ampx sandbox secret set STRIPE_SECRET_KEY
npx ampx sandbox secret set STRIPE_WEBHOOK_SECRET
npx ampx sandbox secret set STRIPE_PRO_PRICE_ID
```

**After changing any secret: redeploy the branch.** Secrets are resolved at deploy time, so edits do not reach running Lambdas until the next deployment.

---

#### Step 5 — Create the Pro subscription product in Stripe
**Stripe Dashboard → Products → + Add product** (make sure you're in the right mode: Test or Live)

1. Name: `SideBet Pro`
2. Description: `0% fees on all deposits, withdrawals, and winnings`
3. Click **Add price**:
   - Pricing model: **Standard pricing**
   - Price: `$4.99`
   - Billing period: **Monthly**
   - Currency: `USD`
4. Save product
5. Click on the price you just created → copy the **Price ID** (starts with `price_`)
6. Set this as `STRIPE_PRO_PRICE_ID` in Amplify env vars (Step 4)

To change the Pro price in the future: create a new price in Stripe, update `STRIPE_PRO_PRICE_ID`. Do NOT delete old prices — existing subscribers stay on the old price until you migrate them.

---

#### Step 6 — Set up the webhook endpoint
The backend exposes the webhook handler on **two** endpoints. Use the API Gateway one.

| | URL shape | Use |
|---|---|---|
| **API Gateway** ✅ | `https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/stripe-webhook` | **Configure this in Stripe** |
| Lambda Function URL | `https://xxxxxxxxxxxxxxxx.lambda-url.us-east-2.on.aws/` | Legacy — returns 403 in this AWS account |

Both route to the same Lambda with the same payload format, so the handler is identical either way.
The Function URL is kept only as a fallback; it is not the supported path. See the 403 entry
under Troubleshooting for why.

**To find the API Gateway URL** (either works, no console needed for the first):
- `amplify_outputs.json` → `custom.stripeWebhookApiUrl`
- AWS Console → CloudFormation → your Amplify stack → Outputs tab → `StripeWebhookApiUrl`

**Verify it before pasting it into Stripe** — a `GET` returns a health check:
```
curl -i https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/stripe-webhook
```
A `200` with `{"service":"stripe-webhook","status":"ok",...}` means the endpoint is live and the
handler runs. The response also reports `webhookSecretConfigured` — if that is `false`, deliveries
will fail signature verification with a 400 until the secret is set (Step 6.6 below).

**Add it to Stripe**:
1. Stripe Dashboard → Developers → Webhooks → **+ Add endpoint**
2. Endpoint URL: paste the API Gateway URL
3. Events to listen for — select these:
   - `payment_intent.succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. Click **Reveal** next to Signing secret → copy the `whsec_...` value
6. Set as `STRIPE_WEBHOOK_SECRET` in Amplify env vars

> ⚠️ **Migrating an existing endpoint to a new URL?** The signing secret is per-endpoint,
> so it depends how you do it:
> - **Editing** the existing endpoint's URL in place → the `whsec_...` is unchanged, leave
>   `STRIPE_WEBHOOK_SECRET` alone.
> - **Creating a new endpoint** (and disabling the old one) → it gets a **new** `whsec_...`.
>   You must update `STRIPE_WEBHOOK_SECRET` and redeploy, or every delivery fails signature
>   verification with a `400`. This is the most common follow-on failure after fixing a 403.

**Two separate webhooks needed** — one in Stripe Test mode for testing, one in Stripe Live mode for production. Each will have a different signing secret.

---

#### Step 7 — Enable the Customer Portal (for subscription management)
**Stripe Dashboard → Settings → Billing → Customer Portal** (make sure you're in the right mode)

1. Toggle "Customer portal" ON
2. Under **Cancellation**: enable "Cancel subscriptions"
3. Under **Subscriptions**: enable "Upgrade and downgrade subscriptions" (optional)
4. Click **Save**

This powers the "Manage Subscription" button in the app — users can cancel or update their plan through Stripe's hosted page without any custom UI.

---

#### Step 8 — Test the full flow
Use this test card (no real money charged):
```
Card number:  4242 4242 4242 4242
Expiry:       Any future date (e.g. 12/29)
CVC:          Any 3 digits (e.g. 123)
ZIP:          Any 5 digits (e.g. 12345)
```

**Deposit test**:
1. Open app → Account → Add Funds
2. Enter an amount (e.g. $10)
3. Tap Pay → Stripe Payment Sheet appears
4. Enter test card above → confirm
5. Balance should update within a few seconds (webhook fires → Lambda credits balance)
6. Verify in Stripe Dashboard → Payments → you see a test charge

**Subscription test**:
1. Account → Upgrade to Pro
2. Enter test card → confirm
3. User should see "Pro Member" status
4. Verify in Stripe Dashboard → Subscriptions → active test subscription

**Declined card test**:
- Use card `4000 0000 0000 9995` → triggers "insufficient funds" decline

---

#### Switching from Test → Production
1. Change `STRIPE_PUBLISHABLE_KEY` in `.env` from `pk_test_...` to `pk_live_...`
2. Change the `STRIPE_SECRET_KEY` **secret** from `sk_test_...` to `sk_live_...`
3. Add a new Stripe Live mode webhook endpoint (repeat Step 6 with Live mode ON)
4. Change the `STRIPE_WEBHOOK_SECRET` **secret** to the new Live mode `whsec_...`
5. Create the Pro product/price in Live mode (repeat Step 5)
6. Change the `STRIPE_PRO_PRICE_ID` **secret** to the Live mode `price_...`
7. Redeploy the Amplify branch

The `.env` file controls what the app bundle uses. Amplify Secrets control what the Lambda functions use. Both must be consistent (both test or both live) — mixing them causes `No such payment_intent` errors, since a test-mode key cannot act on a live-mode object.

---

## 🩺 Troubleshooting

**"Could not initialize payment"** — the `stripe-payment-intent` Lambda returned no clientSecret. Check CloudWatch → `/aws/lambda/...stripe-payment-intent...`:
| Log message | Cause | Fix |
|---|---|---|
| `Invalid API Key provided: ` (empty) | Secret missing or set as an Environment variable instead of a Secret | Set it under Hosting → Secrets, redeploy |
| `Invalid API Key provided: sk_...` | Typo, or key from the wrong Stripe mode | Re-copy the key from Stripe |
| `[StripePI] No userId in identity` | Caller is not authenticated | Sign out and back in |
| `[StripePI] Invalid amount:` | Deposit below the $5 minimum | Enter $5 or more |
| No logs at all | Mutation never reached the Lambda | Confirm the backend deployed successfully |

**Balance does not update after a successful payment** — the webhook is not reaching the Lambda. Check Stripe Dashboard → Developers → Webhooks → your endpoint → "Events" tab for delivery failures. A 400 means the signing secret is wrong; a timeout means the URL is wrong; a 403 means the request never reached the Lambda at all — see below.

**Stripe reports the webhook succeeded (200) but the deposit stays `PENDING`** — the handler
ran, took a path that logs an error, and still returned 200. Check CloudWatch →
`/aws/lambda/...stripe-webhook...` and find the line for that PaymentIntent:

| Log line | Cause | Fix |
|---|---|---|
| `No transaction found for PaymentIntent: pi_... { matchesFound: 0 }` | The lookup missed the row | Fixed by the `stripePaymentIntentId` index — see below. Redeploy, then **Resend** the event |
| `PaymentIntent already settled, skipping` | Already credited (a retry, or a manual admin approval) | Nothing to do — working as intended |
| `Unhandled event type: ...` | The endpoint is subscribed to events the handler ignores | Harmless, but trim the event list in Stripe |
| `Event:` line absent entirely | Delivery went to a different endpoint | Check which URL that Stripe endpoint points at |
| `User not found:` | The PaymentIntent's `userId` metadata has no matching User row | Investigate — should not happen |

*Root cause of `matchesFound: 0`:* the webhook used to find the deposit with
`Transaction.list({ filter: { stripePaymentIntentId } })`. A filtered list is **not** a lookup —
it compiles to a DynamoDB **Scan** that reads a single page of the table in arbitrary order and
applies the filter to only that page. Every bet placement, payout, refund and squares purchase
shares the Transaction table, so once it grew past one scan page a given deposit stopped being
found. The handler logged an error, returned 200, and the balance was never credited — while
Stripe showed a green delivery. It is now a real indexed query
(`transactionsByStripePaymentIntentId`), and a lookup that fails returns 500 so Stripe retries
instead of silently dropping a paid deposit. The identical bug on `User.stripeCustomerId`
(subscriptions) was fixed the same way.

> **Deploying these indexes**: adding a GSI to a live DynamoDB table takes a few minutes while
> DynamoDB backfills it. Existing rows that already carry a `stripePaymentIntentId` are
> backfilled automatically, so previously stuck deposits become findable — **Resend** their
> events in Stripe once the deploy finishes and they will settle.

**Webhook deliveries to the Lambda Function URL return `403 Forbidden`** — this is a known
issue in this AWS account, and **the fix is to point Stripe at the API Gateway URL instead**
(`amplify_outputs.json` → `custom.stripeWebhookApiUrl`). Then hit **Resend** on the failed
events in Stripe to settle any deposits that got stuck.

*Why the Function URL fails:* the 403 is produced by AWS *before* the handler runs, so
CloudWatch shows no logs for the request at all. Everything the app controls was checked
against the deployed resources and ruled out:

| Checked | Result |
|---|---|
| Function URL auth type | `NONE` ✅ |
| Resource policy grants anonymous `lambda:InvokeFunctionUrl` | Present — twice ✅ |
| URL configured in Stripe matches the deployed URL | Matches ✅ |
| Amplify deploy succeeds | Yes ✅ |

With all four true, nothing in this repo can produce the 403. The remaining explanation is an
account- or Organization-level control (an SCP or Resource Control Policy) denying anonymous
invoke on Lambda Function URLs — that produces exactly this signature: deploys succeed, the
config reads as correct, and invocations are rejected before reaching Lambda. API Gateway is
not affected, because it invokes the function as `apigateway.amazonaws.com` rather than as an
anonymous caller against a Function URL.

Note that `lambda:CreateFunctionUrlConfig` is *not* blocked here — only invocation is — which
is why the URL provisions cleanly and looks healthy right up until Stripe calls it.

*Do not bother re-adding invoke permissions.* `amplify/backend.ts` already declares an explicit
`CfnPermission` (`Principal: "*"`, `lambda:InvokeFunctionUrl`, `FunctionUrlAuthType = NONE`)
**in addition to** the one CDK adds automatically for `authType: NONE` (verified in
`aws-cdk-lib/aws-lambda/lib/function-url.js`). Both statements are in the deployed policy.
Adding a third changes nothing.

**Diagnosing any webhook endpoint** — curl it. Run this from a normal machine; a corporate
proxy or sandboxed environment returns its *own* 403 and gives a false reading (look for
`CONNECT tunnel failed`, which is the proxy, not AWS):

```
curl -i <the-url-configured-in-stripe>
```

| Response | Meaning | Fix |
|---|---|---|
| `200 {"service":"stripe-webhook","status":"ok",...}` | Endpoint live, handler runs. Any delivery failure is signature- or handler-side, not routing. | Check CloudWatch logs |
| `200` but `webhookSecretConfigured: false` | Endpoint fine, but `STRIPE_WEBHOOK_SECRET` never reached the Lambda | Set it under Hosting → **Secrets** (not Environment variables), redeploy |
| `403 {"Message":"Forbidden"}` | Request never reached Lambda | Switch Stripe to `stripeWebhookApiUrl` (above) |
| `404 {"message":"Not Found"}` | Right API, wrong path | Path must be exactly `/stripe-webhook` |

**Meanwhile, no payment is ever lost.** Card deposits whose webhook never landed stay `PENDING`
and appear in the **admin dashboard approval queue** with their Stripe PaymentIntent ID.
Verify the charge in Stripe, then approve (requires typing the last 4 of that PaymentIntent
ID). `TransactionService.updateTransactionStatus` refuses to credit a transaction already
marked `COMPLETED`, so a late webhook cannot double-credit after a manual approval.

**Payment form does not appear at all**
- *On iOS/Android*: the native Stripe module is missing. The Payment Sheet requires an EAS build — it does not work in Expo Go.
- *On web*: `STRIPE_PUBLISHABLE_KEY` is missing from `.env`, so Stripe.js never loads. The form reports "Payments are not configured for web."

---

### Subscriptions specifically

**"Could not start your subscription"** — `stripe-manage` returned no `clientSecret`.
Check CloudWatch → `/aws/lambda/...stripe-manage...`:

| Log line | Cause | Fix |
|---|---|---|
| `No such price: 'price_...'` | `STRIPE_PRO_PRICE_ID` is from the other Stripe mode | Create the price in the mode matching `STRIPE_SECRET_KEY`, update the secret, redeploy |
| `Invalid API Key provided:` (empty) | Secret set as an Environment variable, not a Secret | Set under Hosting → **Secrets**, redeploy |
| `This property cannot be expanded (latest_invoice.payment_intent)` | Pre-fix code | Fixed — see the API version note below |
| `No confirmation secret on subscription invoice` | Invoice finalized with nothing to collect (e.g. a 100% coupon) | Expected for $0 invoices; the webhook still grants Pro |
| `Subscription already active` | User is already subscribed | Working as intended — the app now says so instead of erroring |

**User paid but is still on the Free tier** — the charge and the tier are set by two
different paths. Stripe taking the money proves nothing about `User.subscriptionTier`,
which only `stripe-webhook` writes. Check, in order:
1. Stripe Dashboard → Developers → Webhooks → is `customer.subscription.*` in the endpoint's
   event list, and are deliveries succeeding? A 403 means the endpoint URL is stale — use
   the API Gateway URL, not the Function URL (see Step 6).
2. CloudWatch → `/aws/lambda/...stripe-webhook...` for `Subscription active for user ...`.
   `Subscription update failed` there means the write was rejected — the message names the field.
3. `No user found for Stripe customer: cus_...` means the customer has no matching User row.
   That path deliberately does **not** retry.

The app no longer claims success on faith: `SubscriptionScreen` polls the User record after
payment and only says "Welcome to Pro!" once the tier has actually flipped. If the webhook is
down the user sees "Payment received … can take a moment to activate" instead — accurate, and
it does not invite a second charge.

#### ⚠️ Stripe API version pitfalls (the cause of the original breakage)

This integration pins `apiVersion: '2026-06-24.dahlia'`. Two fields moved in
`2025-03-31.basil`, and **both** failures are silent — a `Stripe.Subscription` cast to `any`
compiles perfectly and returns `undefined` at runtime:

| Removed | Replacement | Symptom if you use the old one |
|---|---|---|
| `Invoice.payment_intent` | `Invoice.confirmation_secret.client_secret`, via `expand: ['latest_invoice.confirmation_secret']` | Stripe **rejects the unknown expand path**, so `subscriptions.create` throws outright |
| `Subscription.current_period_end` | `Subscription.items.data[].current_period_end` | `new Date(undefined * 1000).toISOString()` throws `RangeError`, failing the webhook after the payment succeeded |

Also note Stripe's subscription statuses do **not** upper-case cleanly onto the
`User.subscriptionStatus` enum — `canceled` (one L) vs `CANCELLED` (two) is the trap. Use
`mapSubscriptionStatus()` in the webhook handler rather than `status.toUpperCase()`.

**Known gap — `TRIALING` grants no benefits.** The webhook sets `subscriptionTier: 'PRO'` for
a trialing subscription, but every entitlement check is
`tier === 'PRO' && status === 'ACTIVE'` (`transactionService.ts`, `SubscriptionScreen.tsx`),
so a trialing member would still be charged Free-tier fees. This cannot fire today — the Pro
price has no trial period — but **add `TRIALING` to those checks before configuring one.**

**Webhook events are not ordered.** Every signup emits `customer.subscription.created`
(`incomplete`) and then `customer.subscription.updated` (`active`) seconds apart, and Stripe
makes no delivery-order guarantee. Handling those in the wrong order would write FREE over
PRO. `handleSubscriptionChange` therefore re-reads the subscription from Stripe instead of
trusting the event payload — do not "optimise" that call away.

**If a `Stripe.*` type ever fails to compile, check the API changelog before casting to
`any`.** A TS2339 on a Stripe type is usually the compiler reporting a real API change, and
casting converts a build error you can see into a runtime error you cannot. That is precisely
how both bugs above shipped.

`npm run typecheck` does **not** cover `amplify/` — its tsconfig only includes `src/`. To
typecheck the Lambdas: `npx tsc --noEmit --project amplify/tsconfig.json`.
