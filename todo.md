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

## 🔄 IMMEDIATE NEXT STEPS (Current Development Cycle)

### **Priority 1: Critical Bug Fixes & UI Polish** ✅ COMPLETED
- [ ] the signout button on settings page i want to replace the system prompt with a prompt that we create. "Are you sure?", this will help me test on the web and apps.
- [ ] i need to capture phone numbers for sms verification and finding friends. 



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
├── contexts/               # AuthContext for user state
├── services/
│   ├── bulkLoadingService.ts             # Optimized data fetching
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
