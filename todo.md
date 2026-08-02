# SideBet Project Status & Roadmap

## 📱 Project Overview
**SideBet** is a React Native peer-to-peer betting app built with Expo and AWS Amplify. The platform enables users to create and join bets with friends, featuring real-time updates, comprehensive friend management, and secure payment handling.

---

## 🎉 CURRENT STATUS: MVP COMPLETE + FULL ACCOUNT SYSTEM

### ✅ **FULLY IMPLEMENTED FEATURES**

#### **Core Betting Platform**
- **User Authentication**: Complete registration/login with AWS Cognito
- **Bet Creation & Management**: Real-time bet creation with GraphQL API integration
- **Bet Participation**: Join bets with balance validation and deduction
- **Bet Resolution**: Complete payout system with automatic balance distribution
- **Real-time Updates**: Live bet feed with GraphQL subscriptions
- **User Statistics**: Win rates, total bets, earnings tracking
- **Bet Invitations**: Full invite system with friend selection modal on bet cards

#### **Advanced Social Features**
- **Friend Management**: Complete friend request/accept/decline workflow
- **Friend Discovery**: Search by username, email, display name
- **Bet Invitations**: Invite friends to existing bets with one tap
- **Profile System**: Editable display names and profile pictures with S3 storage
- **Notification System**: Complete preference system with in-app toasts, database records, and push notification infrastructure (needs Firebase setup)

#### **Complete Account Menu System**
- **Detailed Stats Screen**: Comprehensive analytics with win/loss streaks, financial tracking, performance metrics
- **Betting History Screen**: Full transaction history with filtering (all, won, lost, cancelled)
- **Payment Methods Screen**: Balance management interface (ready for payment integration)
- **Trust & Safety Screen**: Security settings with password change and 2FA (TOTP)
- **Settings Screen**: Full notification preference system with database persistence (8 notification types, master controls, DND scheduling)
- **Support Screen**: FAQ, GitHub issue reporting, help resources
- **About Screen**: App version, legal links, tech stack credits

#### **Professional UI/UX**
- **Design System**: Comprehensive color, typography, and spacing tokens
- **Modal Standards**: ModalHeader component with consistent UX patterns
- **Navigation**: Bottom tab navigation with 5 screens
- **Responsive Components**: BetCard with invite buttons, standardized modals
- **User Feedback**: GitHub integration for bug reports
- **Balance Management**: Real-time balance tracking throughout the app

#### **Technical Infrastructure**
- **AWS Amplify Gen2**: Modern serverless backend with GraphQL
- **TypeScript**: Full type safety across the codebase
- **Real-time Subscriptions**: Live updates for bets, friends, notifications
- **S3 Storage**: Profile pictures with on-demand signed URLs
- **Scheduled Lambda**: Automated bet status checking
- **Bulk Loading Service**: Optimized data fetching with caching

---

## 💳 STRIPE INTEGRATION STATUS

### ✅ Completed (this session)
- **Card deposits via Stripe Payment Sheet** — replaces manual Venmo TX ID entry
  - `stripe-payment-intent` Lambda creates PaymentIntent, returns clientSecret
  - `AddFundsModal` replaced with 2-step Stripe flow (amount → Payment Sheet → success)
  - Card processing passed through at Stripe's cost (2.9% + $0.30, grossed up so
    the platform nets the full deposit), shown transparently before payment
- **Stripe webhook** Lambda updates Transaction + credits balance automatically
  - Exposed via Lambda Function URL (copy URL from CloudFormation outputs → Stripe Dashboard → Developers → Webhooks)
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

### ⚙️ Stripe Setup Guide (Test → Production)

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

### 🩺 Troubleshooting

**"Could not initialize payment"** — the `stripe-payment-intent` Lambda returned no clientSecret. Check CloudWatch → `/aws/lambda/...stripe-payment-intent...`:
| Log message | Cause | Fix |
|---|---|---|
| `Invalid API Key provided: ` (empty) | Secret missing or set as an Environment variable instead of a Secret | Set it under Hosting → Secrets, redeploy |
| `Invalid API Key provided: sk_...` | Typo, or key from the wrong Stripe mode | Re-copy the key from Stripe |
| `[StripePI] No userId in identity` | Caller is not authenticated | Sign out and back in |
| `[StripePI] Invalid amount:` | Deposit below the $5 minimum | Enter $5 or more |
| No logs at all | Mutation never reached the Lambda | Confirm the backend deployed successfully |

**Balance does not update after a successful payment** — the webhook is not reaching the Lambda. Check Stripe Dashboard → Developers → Webhooks → your endpoint → "Events" tab for delivery failures. A 400 means the signing secret is wrong; a timeout means the URL is wrong; a 403 means the request never reached the Lambda at all — see below.

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

### 🔮 Phase 2: Automated Withdrawals (Stripe Connect Express)
**Goal**: Eliminate the remaining manual admin step for paying out withdrawals.

**How it works:**
1. User taps "Withdraw" — they're prompted to connect their bank via Stripe Connect Express onboarding
2. One-time onboarding: user enters bank account info, Stripe verifies identity (KYC)
3. After onboarding, `User.stripeConnectedAccountId` is stored in DynamoDB
4. On withdrawal request: platform calls `stripe.transfers.create()` → funds hit user's bank in 1-2 days

**Implementation steps:**
1. Add `stripeConnectedAccountId` field to User model in `amplify/data/resource.ts`
2. Create `stripe-connect-onboard` Lambda: calls `stripe.accountLinks.create()` with type `account_onboarding`, returns onboarding URL
3. Add new GraphQL mutation `createStripeConnectOnboardingLink` → backed by Lambda
4. In `WithdrawFundsModal`: check if user has `stripeConnectedAccountId`
   - If not: show "Connect Your Bank" button → open onboarding URL (Linking.openURL)
   - If yes: show standard withdrawal flow
5. Handle `account.updated` webhook event → update `stripeConnectedAccountId` when onboarding completes
6. Create `stripe-payout` Lambda: calls `stripe.transfers.create({ destination: connectedAccountId, amount, currency: 'usd' })`
7. Replace admin approval queue for withdrawals with automatic payout trigger
8. Withdrawal then completes in 1-2 business days with no admin involvement

**Cost**: Stripe charges 0.25% per payout (capped at $2) — already covered by the 2% withdrawal fee for Free tier. Pro members pay 0% withdrawal fee but the platform still pays Stripe's ~0.25%.

---

## 🔄 IMMEDIATE NEXT STEPS (Current Development Cycle)

### **Priority 1: Critical Bug Fixes & UI Polish** ✅ COMPLETED
- [ ] the signout button on settings page i want to replace the system prompt with a prompt that we create. "Are you sure?", this will help me test on the web and apps.
- [ ] i need to capture phone numbers for sms verification and finding friends. 
- [ ] lets remove the stats from the my bets page and the profile's main page. those are needless.
- [ ] payment methods, its unclear how they get verified. there doesnt appear to be a way to do it. should it just be when the first payment is authorized?
- [ ] i feel like the resolved bets should be loaded in separately or we should remove them from my bets completely. 



### **Priority 2: Account Screen Enhancements**
- [ ] Wire up Payment Methods screen to actual payment integration
- [x] Implement Trust & Safety features **✅ COMPLETED**
  - [x] Change password functionality (AWS Cognito updatePassword)
  - [x] Two-factor authentication setup (AWS Cognito TOTP)
  - [ ] Two-factor SMS
- [x] **Notification System Implementation** **✅ COMPLETED (2025-10-26)**
  - [x] Database schema for user notification preferences
  - [x] Notification preferences service with CRUD operations
  - [x] Settings screen with real-time preference persistence
  - [x] Master controls (push, in-app, email)
  - [x] Granular notification type filters (8 categories)
  - [x] Do Not Disturb scheduling
  - [x] Toast notification system with smart batching and rate limiting
  - [x] Snackbar-style UI with priority-based display
  - [x] Type-specific navigation handlers
  - [x] Integration with notification creation flow
  - [ ] **BLOCKERS for Push Notifications:**
    - [ ] Firebase configuration for Android (E_REGISTRATION_FAILED)
    - [ ] EXPO_ACCESS_TOKEN environment variable in Lambda
  - [ ] **Missing Notification Triggers:**
    - [ ] BET_JOINED (add to BetsScreen.tsx when user joins)
    - [ ] BET_RESOLVED (add to ResolveScreen.tsx when resolved)
    - [ ] BET_CANCELLED (add to cancellation logic)
    - [ ] DEPOSIT_COMPLETED/FAILED (add to transactionService.ts)
    - [ ] WITHDRAWAL_COMPLETED/FAILED (add to transactionService.ts)
    - [ ] PAYMENT_METHOD_VERIFIED (add to paymentMethodService.ts)
  - [x] **Currently Working:** FRIEND_REQUEST_RECEIVED, FRIEND_REQUEST_ACCEPTED, FRIEND_REQUEST_DECLINED

- [x] Settings screen functionality **✅ COMPLETED**
  - [x] Connect notification toggles to database with real-time persistence
  - [x] Optimistic UI updates with error rollback
  - [x] Loading states and error handling
  - [ ] Language/currency preference persistence (UI exists, needs backend)
- [ ] Support screen improvements
  - Add more FAQ entries
  - Direct support contact method

### **Priority 3: Feature Completion**
- [ ] Remove or implement private bet functionality
  - Currently toggle exists but does nothing
  - Either wire up private bet logic or remove the option
- [x] In-app toast notifications with expo-notifications **✅ COMPLETED**
  - [x] Smart batching (3+ same type → single batch toast)
  - [x] Rate limiting (max 1 toast per 3 seconds)
  - [x] Priority-based display (URGENT > HIGH > MEDIUM)
  - [x] Queue overflow protection (5+ → batch message)
  - [x] Auto-dismiss based on priority (5s/4s/3s)
- [ ] Push notifications configuration
  - Infrastructure complete, needs Firebase setup + EXPO_ACCESS_TOKEN
- [ ] Instant balance updates after payouts and joins
- [ ] Add missing notification event triggers (bet events, payment events)

---

## 🚀 MEDIUM-TERM ROADMAP (Next Major Features)

### **Enhanced User Experience**
- [ ] **Balance Management System**
  - Add funds functionality
  - Withdraw funds functionality
  - Transaction history with filtering
  - Balance audit trail
- [ ] **Advanced Trust System**
  - Reputation tracking based on bet resolution
  - Dispute resolution workflow
  - Trust score calculation improvements
- [ ] **Bet Discovery Improvements**
  - Category-based filtering
  - Search functionality
  - Trending bets section
- [ ] **Profile Enhancements**
  - Achievement badges
  - Betting statistics visualization
  - Friend leaderboards

### **Social Features**
- [ ] **Bet Templates**
  - Popular bet types
  - Custom user templates
  - generally simplify the options. 
- [ ] **Activity Feed**
  - Friend betting activity. either a separate live bet screen section or prioritized in the list.
  - Trending topics

### **Platform Expansion**
- [ ] **QR Code Integration**: Bet sharing and quick joining
- [ ] **Camera Features**: Photo evidence for bet resolution
- [ ] **Location Services**: Location-based bet discovery
- [ ] **Advanced Analytics Dashboard**: Deep insights into betting patterns

### **Long Term Ideas**
- [ ] **Nemesis identification**: the person you've lose to the most get called out differently than others. 

---

## 🏗️ TECHNICAL DEBT & IMPROVEMENTS

### **Code Quality**
- [ ] **TypeScript Type Errors**: Fix TypeScript compilation errors (HIGH PRIORITY)
  - Missing type definitions for React, React Native, AWS Amplify modules
  - Implicit 'any' type errors in function parameters throughout codebase
  - Missing @types/node for process.env usage in Lambda functions
  - Missing expo TypeScript base config (tsconfig.json references 'expo/tsconfig.base')
  - May require: npm install --save-dev @types/react @types/react-native @types/node
  - Note: These are pre-existing errors, not related to new 2FA/password implementation
- [ ] **TypeScript Strict Mode**: Enable strict compilation settings
- [ ] **Error Boundaries**: Implement React error boundaries for crash recovery
- [ ] **Unit Testing**: Add test coverage for core betting functionality
- [ ] **ESLint Configuration**: Complete linting setup
- [ ] **Code Documentation**: Add JSDoc comments to services and utilities

### **Performance Optimization**
- [ ] **FlatList Virtualization**: Optimize large bet list rendering
- [ ] **Image Optimization**: Implement caching and compression for profile pictures
- [ ] **GraphQL Optimization**: Add query fragments and batching
- [ ] **Bundle Size**: Analyze and reduce app bundle size
- [ ] **Memory Management**: Profile and optimize memory usage

### **Security Enhancements**
- [ ] **Input Validation**: Comprehensive form validation across all inputs
- [ ] **Rate Limiting**: Prevent bet creation and API abuse
- [ ] **File Upload Security**: Enhanced S3 upload validation
- [ ] **Authentication Flow**: Add session timeout and refresh token handling
- [ ] **Data Encryption**: Sensitive data encryption at rest

---

## 📱 DEPLOYMENT PREPARATION

### **Pre-Launch Checklist**
- [ ] **App Store Assets**
  - App icon design and implementation
  - Splash screen optimization
  - Screenshots for store listings
  - App description and keywords
- [ ] **Legal Requirements**
  - Terms of Service finalization
  - Privacy Policy completion
  - Community Guidelines
  - Age restrictions and compliance
- [ ] **Backend Infrastructure**
  - Production environment setup
  - Database backup strategy
  - Monitoring and alerting
  - Error logging (Sentry integration)

### **Android (Primary Platform)**
- [ ] **App Metadata**: Update app.json with final branding
- [ ] **Visual Assets**: Configure splash screen and app icons
- [ ] **EAS Build Setup**: Configure production build profiles
- [ ] **Device Testing**: Test on multiple Android devices and screen sizes
- [ ] **Performance Testing**: Load testing and stress testing
- [ ] **Beta Testing**: TestFlight/Google Play beta program

### **iOS (Future Platform)**
- [ ] **iOS Configuration**: Platform-specific settings
- [ ] **App Store Preparation**: iOS-specific submission requirements
- [ ] **Device Testing**: iOS simulator and device testing
- [ ] **Apple Review Compliance**: Ensure compliance with App Store guidelines

---

## 🧪 TESTING & QUALITY ASSURANCE

### **Current Test Coverage**
- ✅ **MVP Features**: All core betting functionality tested and working
- ✅ **Friend Management**: Complete social features verified
- ✅ **Real-time Updates**: Live data synchronization confirmed
- ✅ **Account System**: All 7 account screens functional

### **Testing Priorities**
- [ ] **User Flow Testing**
  - Complete bet lifecycle (create → invite → join → resolve → payout)
  - Friend request/accept workflow
  - Profile editing and picture upload
  - Notification delivery and interaction
- [ ] **Edge Cases**
  - Network connectivity issues
  - Invalid/malicious data input
  - Concurrent bet operations
  - Race conditions in balance updates
- [ ] **Performance Testing**
  - Large bet lists (100+ bets)
  - Multiple concurrent users
  - High-frequency notifications
  - Image loading performance
- [ ] **Security Testing**
  - Authentication bypass attempts
  - Authorization checks
  - SQL injection prevention
  - XSS vulnerability testing

---

## 📊 SUCCESS METRICS & MONITORING

### **Key Performance Indicators**
- User engagement (DAU/MAU ratios)
- Bet completion rate and average bet amounts
- Friend invitation and acceptance rates
- App store ratings and user feedback
- Technical performance (load times, error rates)
- Balance transaction accuracy
- Notification delivery success rate

### **Analytics Integration** (To Implement)
- [ ] User behavior tracking (Amplitude/Mixpanel)
- [ ] Bet performance analytics
- [ ] Revenue tracking (when monetized)
- [ ] Trust score effectiveness metrics
- [ ] Conversion funnel analysis
- [ ] Retention cohort analysis

---

## 🔧 DEVELOPMENT SETUP

### **Key Commands**
```bash
npm start              # Start Expo development server
npm run android        # Run on Android device/emulator
npm run ios            # Run on iOS simulator
npm run typecheck      # Run TypeScript type checking
npx amplify push       # Deploy backend changes
npx amplify codegen    # Generate GraphQL types
```

### **Troubleshooting: Expo/Metro Not Starting**

If Expo or Metro bundler won't start or shows port conflicts, use these commands:

**Windows:**
```bash
# Find and kill processes on port 8081 (Metro bundler)
netstat -ano | findstr :8081
taskkill /PID <PID> /F

# Kill all Node processes
taskkill /F /IM node.exe

# Kill all Java processes (Android emulator/Gradle)
taskkill /F /IM java.exe

# Kill all Expo processes
taskkill /F /IM expo.exe

# Clear Metro cache and restart
npx expo start --clear
```

**macOS/Linux:**
```bash
# Find and kill processes on port 8081
lsof -ti:8081 | xargs kill -9

# Kill all Node processes
pkill -9 node

# Kill all Java processes
pkill -9 java

# Clear Metro cache and restart
npx expo start --clear
```

**Full Reset Procedure:**
```bash
# 1. Kill all processes
taskkill /F /IM node.exe
taskkill /F /IM java.exe

# 2. Clear all caches
npx expo start --clear

# 3. If still having issues, clear npm cache
npm cache clean --force

# 4. Delete node_modules and reinstall (last resort)
rm -rf node_modules
npm install
```

**Common Issues:**
- **Port 8081 in use**: Kill node.exe processes
- **Android emulator stuck**: Kill java.exe processes
- **Metro bundler cache issues**: Use `--clear` flag
- **TypeScript errors persisting**: Run `npx amplify codegen` to regenerate types

### **Current Development Status**
- **Main Branch**: `main` (stable, full account system complete)
- **Latest Features**: Account menu system, bet invitations, modal standards
- **Status**: Production-ready MVP with complete feature set

---

## 📁 CURRENT APP ARCHITECTURE

### **Core Structure**
```
src/
├── components/
│   ├── betting/            # BetCard, BetList, CreateBet
│   ├── ui/                 # Header, ModalHeader, ProfileEditor, Modals
│   ├── Login.tsx           # Authentication
│   └── SignUp.tsx          # User registration
├── screens/
│   ├── HomeScreen.tsx      # Main bet feed
│   ├── CreateBetScreen.tsx # Bet creation with friend invites
│   ├── BetsScreen.tsx      # My Bets (user's active bets)
│   ├── LiveEventsScreen.tsx# Joinable bets feed
│   ├── FriendsScreen.tsx   # Friend management
│   ├── AccountScreen.tsx   # Profile & settings hub
│   ├── DetailedStatsScreen.tsx    # Comprehensive analytics
│   ├── BettingHistoryScreen.tsx   # Bet history
│   ├── PaymentMethodsScreen.tsx   # Balance management
│   ├── TrustSafetyScreen.tsx      # Security settings
│   ├── SettingsScreen.tsx         # App preferences
│   ├── SupportScreen.tsx          # Help & FAQ
│   ├── AboutScreen.tsx            # App info
│   ├── NotificationScreen.tsx     # Notifications
│   └── ResolveScreen.tsx          # Bet resolution
├── contexts/               # AuthContext for user state, BetDataContext for bet/squares data
├── services/
│   ├── bulkLoadingService.ts             # Legacy (dead code) - replaced by BetDataContext
│   ├── notificationService.ts            # Push & in-app notifications with preference checking
│   ├── notificationPreferencesService.ts # User notification preference management
│   ├── toastNotificationService.ts       # In-app toast with batching & rate limiting
│   ├── imageUploadService.ts             # S3 profile pictures
│   └── pushNotificationConfig.ts         # Expo notifications setup
├── styles/                 # Design system tokens
└── types/                  # TypeScript definitions
```

### **Backend Schema**
- **Bet Model**: Complete lifecycle from creation to resolution
- **User Model**: Profile data, balance tracking, statistics
- **Participant Model**: Bet participation records
- **Friend Models**: Bilateral friendships and friend requests
- **BetInvitation Model**: Friend invite system
- **Notification Model**: Real-time activity updates
- **NotificationPreferences Model**: User notification settings (master controls, type filters, DND)
- **PushToken Model**: Device push notification tokens
- **S3 Storage**: Profile picture uploads with on-demand signed URLs
- **Lambda Functions**: Scheduled bet checker, push notification sender

---

## 🎯 PROJECT PHILOSOPHY

**SideBet** prioritizes:
1. **User Trust**: Transparent betting with friend-based social proof
2. **Real-time Experience**: Live updates and instant feedback
3. **Mobile-First Design**: Native performance and platform conventions
4. **Social Integration**: Friend-centric betting for enhanced engagement
5. **Technical Excellence**: Type safety, error handling, and scalable architecture
6. **User Privacy**: Secure data handling and transparent permissions

---

## 📈 RECENT MILESTONES

- ✅ **Comprehensive Notification System** (Latest - 2025-10-26)
  - **Notification Preferences System:**
    - Database schema for user preferences (NotificationPreferences model)
    - Complete preference service with CRUD operations
    - Settings screen with real-time database persistence
    - Master controls (push, in-app, email)
    - 8 granular notification type filters (friends, bets, payments, system)
    - Do Not Disturb scheduling with time windows
    - All preferences default to enabled for good UX
  - **Intelligent Toast Notification System:**
    - Smart batching: 3+ same-type notifications → single batch toast
    - Rate limiting: Max 1 toast per 3 seconds to prevent spam
    - Queue overflow protection: 5+ notifications → batch message
    - Priority-based display: URGENT (red, 5s) > HIGH (green, 4s) > MEDIUM (blue, 3s)
    - LOW priority = DB record only (no toast, no push)
    - Snackbar-style UI positioned at bottom above tab bar
    - Type-specific navigation handlers for all 17 notification types
    - AppState detection (toasts only when app is active)
  - **Integration & UX:**
    - NotificationService respects all user preferences
    - DND windows respected (creates DB records but skips push/toast)
    - Push notifications for background, toasts for foreground (never both)
    - Optimistic UI updates with error rollback
    - Comprehensive logging for debugging
  - **Known Blockers:**
    - Push notifications need Firebase configuration for Android
    - EXPO_ACCESS_TOKEN needed in Lambda function
    - Missing notification triggers for bet events and payment events
- ✅ **P1 Bug Fixes & UX Improvements** (2025-10-25)
  - Event check-in integration with bet creation (auto-fills team names)
  - Extended event discovery window from 24 to 48 hours
  - Improved bet type templates (removed weather/entertainment, added over/under)
  - Enhanced mobile UX with taller tab buttons on LiveEventsScreen
- ✅ **Change Password & 2FA Implementation** (2025-10-25)
  - AWS Cognito password change with validation
  - Two-factor authentication (TOTP) setup and management
  - Comprehensive security modals with real-time validation
- ✅ Complete Account Menu System (7 new screens)
- ✅ Bet Invitation System on Bet Cards
- ✅ Modal Standardization (ModalHeader component)
- ✅ Profile Picture S3 Integration with Signed URLs
- ✅ Notification Screen with Filtering
- ✅ Bulk Loading Service for Performance

---

*Last Updated: Comprehensive notification system completed - User preferences, intelligent toast notifications with batching/rate limiting, navigation handlers (2025-10-26)*
