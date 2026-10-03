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
- **Notification System**: Feed, in-app banners and push (Expo + Web Push) from one server-side dispatcher; per-category preferences, quiet hours, per-device switch, automatic expiry. See PUSH_NOTIFICATION_GUIDE.md

#### **Complete Account Menu System**
- **Detailed Stats Screen**: Comprehensive analytics with win/loss streaks, financial tracking, performance metrics
- **Betting History Screen**: Full transaction history with filtering (all, won, lost, cancelled)
- **Payment Methods Screen**: Balance management interface (ready for payment integration)
- **Trust & Safety Screen**: Security settings with password change and 2FA (TOTP)
- **Settings Screen**: Notification settings (this device, alerts, per-category alerts/feed, quiet hours, device list, send test), privacy, app preferences
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

## 💳 STRIPE INTEGRATION — ✅ COMPLETE

Card deposits and Pro subscriptions are live and working. Deposits credit balances
automatically via the Stripe webhook; no manual step remains for card payments.

**Setup, configuration and troubleshooting now live in [STRIPE_GUIDE.md](./STRIPE_GUIDE.md).**
Go there for API keys and secrets, the webhook endpoint, test → production switchover, and
the diagnosis tables for failed payments.

Remaining Stripe work is Phase 2 below.

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

## 🔔 NOTIFICATIONS

Overhaul Phases 0–5 are done.
- **How it works now:** [PUSH_NOTIFICATION_GUIDE.md](./PUSH_NOTIFICATION_GUIDE.md).
- **Decisions, what's deliberately left alone, the before-launch checklist, and the on-device checks still to do:** [docs/NOTIFICATIONS_PLAN.md](./docs/NOTIFICATIONS_PLAN.md).

### Notification types that are defined but never raised

Checked 2026-10-04. Every other type in `amplify/shared/notificationCatalog.ts` has a producer.
- [ ] `BET_DEADLINE_APPROACHING`: `NotificationService.notifyBetDeadlineApproaching` exists but
      nothing calls it. The natural home is `scheduled-bet-checker`.
- [ ] `SQUARES_INVITATION_ACCEPTED`: accepting a squares invitation doesn't notify the inviter
      (declining does).
- [ ] `SYSTEM_ANNOUNCEMENT`: there's no way to send an announcement (an admin tool would write the rows).

### Not covered by the notifications work: old sports events are never cleaned up

`LiveEvent` (ESPN games from `event-fetcher`) and `EventCheckIn` grow forever. The
fetcher only marks finished games `isActive = 0` and deletes duplicates; nothing removes
old games. Not part of notification retention (that covers the `Notification` log and
device registrations only).

- [ ] Daily cleanup of games finished more than ~30 days ago, found by Query on
      `activeEventsByTime` with `isActive = 0` (never a Scan), deleting their check-ins too.
- [ ] Keep any game still referenced by an unsettled Bet or SquaresGame. `Bet.eventId`
      has no index — add `betsByEvent`, or rely on `LiveEvent.betCount` — and
      `squaresGamesByEvent` already exists.
- [ ] Confirm bet and squares history screens render when their event is gone.

### Security issue found during the notifications work (outside its scope)

- [ ] **Any signed-in user can update any `User` record, including `balance`.** The rule is
      `allow.authenticated().to(['read', 'create', 'update'])`, commented "for balance
      changes, stats, etc." in `amplify/data/resource.ts`. Balance and stats changes should
      move to Lambdas (IAM) and the client rule narrowed to owner-only profile fields.

### Already fixed (do not re-investigate)

- **`.list({ filter })` is a paged Scan, never a lookup.** It reads one arbitrary page of the
  table and silently misses matching rows once the table outgrows a page. It broke push token
  lookup (that model has since been replaced by `PushDevice`), `Transaction.stripePaymentIntentId`,
  `User.stripeCustomerId` and `NotificationPreferences.userId`; all are now GSI queries.
  **If a lookup by a non-key field misbehaves anywhere else, suspect this pattern first.**

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
- [x] **Notification system** — rebuilt in the 2026-10 overhaul; see the 🔔 NOTIFICATIONS section above.

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
- [x] Push notification polish (web deep links, Android channels/icon, iOS badge) — Phases 6–8, done in code
- [ ] Verify push on a real Android device, and on iOS once the Apple account exists — §5 of docs/NOTIFICATIONS_PLAN.md
- [ ] Run `npx expo prebuild --platform android` before the next Android build (new notification icon)
- [ ] Instant balance updates after payouts and joins
- [ ] Raise the three never-raised notification types (see 🔔 NOTIFICATIONS above)

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
│   ├── notificationService.ts            # Write notifications, register this device, read the feed
│   ├── notificationPreferencesService.ts # Load/save notification preferences
│   ├── toastNotificationService.ts       # In-app toast with batching & rate limiting
│   ├── imageUploadService.ts             # S3 profile pictures
│   ├── pushNotificationConfig.ts         # Expo foreground behaviour, Android channels, native taps, iOS badge
│   ├── notificationTap.ts                # Routes a tapped push to its screen; holds taps until the navigator is ready
│   └── webPushBridge.ts                  # Web: service-worker clicks and renewed subscriptions
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
- **NotificationPreferences Model**: Per-category alert/feed mutes, quiet hours, timezone
- **PushDevice Model**: One row per installation that can receive push
- **S3 Storage**: Profile picture uploads with on-demand signed URLs
- **Lambda Functions**: Scheduled bet/squares checkers, payout processor, event fetcher, Stripe, `push-notification-sender` (notification dispatcher on the Notification stream), `device-registry`

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

- ✅ **Notifications overhaul** (2026-10)
  - One server-side dispatcher pushes every notification (including backend-raised ones) according to the recipient's preferences.
  - Per-category alerts and feed visibility, with money, results, refunds and disputes always in the feed.
  - Quiet hours in the user's timezone; per-device push switch and device list.
  - Automatic expiry via DynamoDB TTL.
  - Owner-only access to notifications, preferences and devices.
  - Details: docs/NOTIFICATIONS_PLAN.md.
- ✅ **Comprehensive Notification System** (2025-10-26) — *superseded by the 2026-10 overhaul above; kept as history*
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
    - ~~Push notifications need Firebase configuration for Android~~ (configured)
    - ~~EXPO_ACCESS_TOKEN needed in Lambda function~~ (sent since Phase 0)
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

*Last Updated: notifications overhaul Phases 0–5 (2026-10-04)*
