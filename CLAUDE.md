# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the SideBet React Native app.

## Quick Commands

- **Development**: `npm start` - Start Expo development server
- **Android**: `npm run android` - Run on Android device/emulator
- **iOS**: `npm run ios` - Run on iOS device/simulator
- **TypeScript**: `npm run typecheck` - Check types
- **Linting**: `npm run lint` - Run ESLint
- **EAS BUILD**: 'eas build -p android --profile production' - ASK FIRST DO NOT RUN YOURSELF

## Architecture Overview

SideBet is a peer-to-peer betting platform built with React Native + Expo for mobile deployment, using AWS Amplify Gen2 for backend services.

### Core Technology Stack
- **Frontend**: React Native + Expo SDK 52
- **Backend**: AWS Amplify Gen2 with GraphQL API
- **Database**: DynamoDB with real-time subscriptions
- **Authentication**: AWS Cognito
- **Storage**: AWS S3 for profile pictures
- **State Management**: React Context + useState/useEffect
- **Navigation**: Bottom tabs with native navigation

### Project Structure
```
src/
├── components/
│   ├── betting/          # BetCard, CreateBet components
│   ├── ui/              # Reusable UI components (Header, ModalHeader, modals)
│   ├── Login.tsx        # Authentication forms
│   └── SignUp.tsx
├── contexts/
│   └── AuthContext.tsx  # User authentication state
├── navigation/
│   └── AppNavigator.tsx # Bottom tab navigation
├── screens/             # Main app screens
├── services/            # API integrations (bulk loading, notifications, image upload)
├── styles/              # Design system tokens
├── types/               # TypeScript definitions
└── utils/               # Helper functions
```

### Key Documentation Files
- **CLAUDE.md** (this file): Main development guide and architecture overview
- **[MODAL_STANDARDS.md](./MODAL_STANDARDS.md)**: **REQUIRED** reading before creating/modifying modals
- **[PUSH_NOTIFICATION_GUIDE.md](./PUSH_NOTIFICATION_GUIDE.md)**: Complete guide to push notification setup, testing, and troubleshooting
- **todo.md**: Current tasks and project roadmap

### Backend Integration
- **GraphQL API**: Real-time queries with `observeQuery()` for live updates
- **Bulk Loading**: Optimized data fetching with `bulkLoadingService` to reduce N+1 queries
- **Authentication**: AWS Cognito with secure token management
- **Database**: DynamoDB with optimized query patterns and client-side sorting
- **File Storage**: S3 with entity-based access controls
- **Real-time**: GraphQL subscriptions for live betting data
- **Caching**: In-memory caching with TTL for improved performance

### Scheduled Lambda Functions
The app uses AWS Lambda functions with EventBridge schedules for automated background tasks:

#### Function Architecture Pattern
```typescript
// amplify/functions/{function-name}/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const functionName = defineFunction({
  name: 'function-name',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
  },
  timeoutSeconds: 300, // 5 minutes timeout
  memoryMB: 512,
  schedule: [
    "*/5 * * * ? *"  // Cron expression for scheduling
  ]
});
```

#### Correct Handler Implementation Pattern
```typescript
// amplify/functions/{function-name}/handler.ts
import { EventBridgeHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';  // IMPORTANT: Use 'aws-amplify/api', not 'aws-amplify/data'
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/{function-name}';  // Replace {function-name} with actual function name

// CRITICAL: Top-level await configuration - this is required for proper client initialization
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

// Use EventBridgeHandler type, not generic Handler
export const handler: EventBridgeHandler<"Scheduled Event", null, boolean> = async (event) => {
  console.log('Function triggered:', JSON.stringify(event, null, 2));

  try {
    // Your function logic here
    const result = await yourMainFunction();

    console.log('Function completed:', result);
    return true; // Return boolean for EventBridge

  } catch (error) {
    console.error('Function failed:', error);
    return false; // Return boolean for EventBridge
  }
};

async function yourMainFunction() {
  // Use client.models.ModelName.list/update/create as needed
  // The client is properly configured and ready to use
}
```

#### Required package.json for Functions
```json
{
  "name": "function-name",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "aws-amplify": "^6.15.4"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.152",
    "@types/node": "^24.4.0"
  }
}
```

#### Integration Steps for New Scheduled Functions:

1. **Create Function Directory**: `amplify/functions/{function-name}/`
   - `resource.ts` - Function definition with schedule
   - `handler.ts` - Function implementation
   - `package.json` - Dependencies

2. **Add to Backend** (`amplify/backend.ts`):
   ```typescript
   import { functionName } from './functions/function-name/resource';

   const backend = defineBackend({
     // ... other resources
     functionName,
   });


3. **Add to GraphQL Schema** (`amplify/data/resource.ts`):
   ```typescript
   import { functionName } from "../functions/function-name/resource";

   const schema = a.schema({
     // ... other models

     functionName: a
       .query()
       .arguments({
         triggerTime: a.string().required()  // ISO timestamp when triggered
       })
       .returns(a.boolean())
       .handler(a.handler.function(functionName))
       .authorization((allow) => [allow.authenticated()]),

   }).authorization((allow) => [
     // ... other authorizations
     allow.resource(functionName).to(["query", "listen", "mutate"])
   ]);
   ```

#### Current Scheduled Functions:
- **scheduledBetChecker**: Runs every 5 minutes - Checks for expired ACTIVE bets, moves them to PENDING_RESOLUTION (if participants) or CANCELLED (if no participants)

## Current App Features

### Core Betting System
- **Bet Creation**: Template-based betting with custom side names
- **Bet Joining**: Real balance validation and deduction
- **Bet Resolution**: Creator-initiated resolution with automatic payouts
- **Real-time Updates**: Live participant counts and balance synchronization
- **Bet Sorting**: Automatic sorting by creation time (newest first) with status priority (LIVE > ACTIVE > PENDING_RESOLUTION)
- **Performance Optimization**: Bulk loading with caching reduces API calls and improves load times

### Social Features
- **Friend Management**: Send/accept/decline friend requests
- **Friend Discovery**: Search by username, email, or display name
- **Bet Invitations**: Invite friends during bet creation with flexible side choice
- **Profile System**: Editable display names and profile pictures

### Payment Management System
- **Venmo Integration**: Add funds and withdraw via Venmo (manual admin verification)
- **Payment Methods**: Add/manage multiple Venmo accounts with verification
- **Transaction Service**: Complete audit trail for all balance changes
- **Unified History**: Single screen showing deposits, withdrawals, bets, wins, refunds
- **Admin Dashboard**: Full transaction approval interface for admins

### Admin Role System
- **Role-Based Access Control**: Three user roles (USER, ADMIN, SUPER_ADMIN)
- **AuthContext Integration**: User role loaded on authentication and stored in context
- **UI Protection**: Admin dashboard menu option only visible to admin users
- **Screen Validation**: AdminDashboardScreen validates role on mount
- **Service-Layer Security**: TransactionService validates admin role before allowing status updates
- **Database Schema**: User.role field with default value of 'USER'
- **Admin Functions**: Approve/reject deposits, approve/reject withdrawals, view pending transactions

### User Experience
- **Authentication**: AWS Cognito with native UI components
- **Navigation**: Bottom tab navigation (Home, Create, My Bets, Friends, Account)
- **Notifications**: Multi-channel notification system with in-app toasts, push notifications, and notification center
- **Profile Pictures**: S3 upload with automatic cleanup

### Push Notification System
- **Provider**: Expo Push Notification Service (no Firebase setup required)
- **Backend**: AWS Lambda function sends via Expo Push API
- **Platforms**: iOS (APNS) and Android (FCM) - fully managed by Expo
- **Token Management**: Automatic registration on login, stored in DynamoDB
- **Deep Linking**: Push notification taps navigate to relevant screens (bets, friend requests, transactions)
- **User Preferences**: Configurable notification types, Do Not Disturb mode
- **Testing**: Requires EAS development build on physical device
- **Documentation**: See [PUSH_NOTIFICATION_GUIDE.md](./PUSH_NOTIFICATION_GUIDE.md) for complete setup and testing guide

### Technical Integrations
- **GitHub Feedback**: Automatic issue creation from in-app feedback
- **Environment Management**: Secure token storage with react-native-dotenv
- **Type Safety**: Full TypeScript coverage with proper type definitions

## Database Schema

### Core Models
```typescript
// User Profile
User {
  id: string
  email: string
  displayName?: string
  profilePictureUrl?: string
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'  // User role for access control
  balance: number
  trustScore: number
  totalBets: number
  totalWinnings: number
  winRate: number
  createdAt: datetime
  updatedAt: datetime
}

// Betting System
Bet {
  id: string
  title: string
  description: string
  betAmount: number
  sideAName: string
  sideBName: string
  status: 'ACTIVE' | 'RESOLVED' | 'CANCELLED'
  creatorId: string
  winningSide?: string
  participantCount: number
  createdAt: datetime
  expiresAt: datetime
}

BetParticipant {
  id: string
  betId: string
  userId: string
  side: string
  amount: number
  joinedAt: datetime
}

// Social Features
FriendRequest {
  fromUserId: string
  toUserId: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED'
  message?: string
  createdAt: datetime
}

Friendship {
  user1Id: string  // Lexicographically smaller ID
  user2Id: string  // Lexicographically larger ID
  createdAt: datetime
}

BetInvitation {
  betId: string
  fromUserId: string
  toUserId: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
  invitedSide: string
  expiresAt: datetime
}

// Notifications
Notification {
  userId: string
  type: NotificationType
  title: string
  message: string
  isRead: boolean
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  relatedBetId?: string
  relatedUserId?: string
}

// Payment Management
PaymentMethod {
  id: string
  userId: string
  type: 'VENMO' | 'PAYPAL' | 'BANK_ACCOUNT' | 'CASH_APP'
  venmoUsername?: string
  venmoPhone?: string
  venmoEmail?: string
  isVerified: boolean
  verifiedAt?: datetime
  verificationMethod?: 'MANUAL' | 'MICRO_DEPOSIT' | 'TRANSACTION_ID'
  isDefault: boolean
  isActive: boolean
  displayName: string
  createdAt: datetime
}

Transaction {
  id: string
  userId: string
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BET_PLACED' | 'BET_WON' | 'BET_CANCELLED' | 'BET_REFUND' | 'ADMIN_ADJUSTMENT'
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  amount: number
  balanceBefore: number
  balanceAfter: number
  paymentMethodId?: string
  venmoTransactionId?: string
  venmoUsername?: string
  relatedBetId?: string
  relatedParticipantId?: string
  notes?: string
  failureReason?: string
  processedBy?: string
  createdAt: datetime
  processedAt?: datetime
  completedAt?: datetime
}
```

## AWS Storage Configuration

### S3 Storage Setup
```typescript
// amplify/storage/resource.ts
defineStorage({
  name: 'sidebet-user-uploads',
  access: (allow) => ({
    'profile-pictures/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete'])
    ]
  })
})
```

### Image Upload Service
```typescript
// src/services/imageUploadService.ts
updateProfilePicture(userId, currentUrl?) -> {
  1. Request camera/photo permissions
  2. Launch image picker with square crop
  3. Upload to S3 with unique filename
  4. Generate public URL (1-year expiry)
  5. Delete old image (cleanup)
  6. Return new profile picture URL
}
```

### Bulk Loading Service
```typescript
// src/services/bulkLoadingService.ts
// Optimized data fetching service that reduces N+1 queries and improves performance
// with pagination, caching, and automatic client-side sorting

// Core Functions:
bulkLoadBetsWithParticipants(statusFilters[], options?) -> Promise<Bet[]>
  - Loads bets and their participants in 2 optimized queries instead of N+1
  - Supports pagination with configurable limits (default: 100 bets, 500 participants)
  - Includes 30-second in-memory caching with TTL
  - Client-side sorting by createdAt descending (newest first)
  - Concurrent query batching with throttling controls

bulkLoadUserBetsWithParticipants(userId, options?) -> Promise<Bet[]>
  - Filters to only bets where user is creator OR participant
  - Uses cached results when available for better performance
  - Automatically sorts by creation date (newest first)

bulkLoadJoinableBetsWithParticipants(userId, options?) -> Promise<Bet[]>
  - Filters to only ACTIVE bets where user is NOT creator and NOT participant
  - Optimized for discovering new bets to join
  - Smaller default limit (50) for better performance

// Caching & Performance:
clearBulkLoadingCache() -> void          // Force refresh by clearing cache
getBulkLoadingCacheStats() -> object     // Debug cache usage and keys

// Usage Examples:
const userBets = await bulkLoadUserBetsWithParticipants(userId, {
  limit: 50,
  useCache: true,
  forceRefresh: false
});

const joinableBets = await bulkLoadJoinableBetsWithParticipants(userId);
```

### Transaction Service
```typescript
// src/services/transactionService.ts
// Complete transaction management with automatic balance updates

// Core Functions:
TransactionService.createTransaction(params) -> Promise<Transaction>
  - Creates transaction record with automatic balance calculation
  - Validates sufficient balance for debits
  - Updates user balance for COMPLETED transactions
  - Records balanceBefore and balanceAfter for audit trail

TransactionService.createDeposit(userId, amount, paymentMethodId, venmoTransactionId) -> Promise<Transaction>
  - Creates PENDING deposit (requires admin approval)
  - Does NOT update balance until admin approves

TransactionService.createWithdrawal(userId, amount, paymentMethodId, venmoUsername) -> Promise<Transaction>
  - Creates PENDING withdrawal (requires admin processing)
  - Validates sufficient balance before creating request

TransactionService.recordBetPlacement(userId, amount, betId, participantId) -> Promise<Transaction>
  - Automatically called when user joins bet
  - Creates COMPLETED transaction
  - Deducts balance immediately

TransactionService.recordBetWinnings(userId, amount, betId, participantId) -> Promise<Transaction>
  - Automatically called when bet is resolved
  - Creates COMPLETED transaction
  - Credits balance with winnings

TransactionService.recordBetCancellation(userId, amount, betId, participantId) -> Promise<Transaction>
  - Refunds user when bet is cancelled
  - Creates COMPLETED transaction
  - Credits balance with original bet amount

TransactionService.getUserTransactions(userId, options?) -> Promise<Transaction[]>
  - Get user's transaction history with filtering
  - Supports type filter (DEPOSIT, WITHDRAWAL, BET_PLACED, etc.)
  - Sorted by date (newest first)

TransactionService.updateTransactionStatus(transactionId, status, failureReason?, processedBy?) -> Promise<boolean>
  - Admin function to approve/reject transactions
  - Updates balance when deposit/withdrawal is COMPLETED
  - Sends notifications for status changes

// Usage Examples:
// User joins bet (automatic)
const transaction = await TransactionService.recordBetPlacement(
  userId,
  50,
  betId,
  participantId
);

// User requests deposit (manual admin approval needed)
const deposit = await TransactionService.createDeposit(
  userId,
  100,
  paymentMethodId,
  'venmo-transaction-id-here'
);

// Admin approves deposit
await TransactionService.updateTransactionStatus(
  depositId,
  'COMPLETED',
  undefined,
  adminUserId
);
```

### Payment Method Service
```typescript
// src/services/paymentMethodService.ts
// Manage user payment methods (Venmo, PayPal, etc.)

// Core Functions:
PaymentMethodService.createPaymentMethod(params) -> Promise<PaymentMethod>
  - Add new Venmo/PayPal/Bank account
  - Validates Venmo username format
  - Automatically sets as default if first method

PaymentMethodService.getUserPaymentMethods(userId, activeOnly?) -> Promise<PaymentMethod[]>
  - Get all payment methods for user
  - Sorted by default first, then creation date

PaymentMethodService.verifyPaymentMethod(paymentMethodId, verificationMethod) -> Promise<boolean>
  - Admin function to verify payment method
  - Required before withdrawals allowed

PaymentMethodService.setDefaultPaymentMethod(userId, paymentMethodId) -> Promise<boolean>
  - Set payment method as default
  - Clears other defaults automatically

PaymentMethodService.removePaymentMethod(paymentMethodId) -> Promise<boolean>
  - Soft delete (marks as inactive)
  - Does not delete transaction history

PaymentMethodService.validateVenmoUsername(username) -> boolean
  - Validates format: 5-30 characters, alphanumeric, hyphens, underscores

// Usage Examples:
// User adds Venmo account
const method = await PaymentMethodService.createPaymentMethod({
  userId,
  type: 'VENMO',
  venmoUsername: '@johndoe',
  venmoEmail: 'john@example.com',
  isDefault: true
});

// Admin verifies payment method
await PaymentMethodService.verifyPaymentMethod(
  methodId,
  'MANUAL'
);
```

## Admin Role System

### Overview
The app uses a role-based access control system with three user roles: `USER` (default), `ADMIN`, and `SUPER_ADMIN`. Admin roles have special permissions to approve deposits/withdrawals and manage transactions.

### Architecture

#### 1. Database Schema
```typescript
// amplify/data/resource.ts
User: a.model({
  // ... other fields
  role: a.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).default('USER'),
})
```

#### 2. AuthContext Integration
```typescript
// src/contexts/AuthContext.tsx
interface User {
  userId: string;
  username: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';  // Role included in auth context
}

// Role is fetched from database during authentication
const { data: userData } = await client.models.User.get({ id: currentUser.userId });
const newUser = {
  userId: currentUser.userId,
  username: currentUser.username,
  role: userData?.role || 'USER'
};
```

#### 3. UI Protection Layer
```typescript
// src/screens/AccountScreen.tsx
// Admin Dashboard menu option only visible to admin users
{(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
  <View style={styles.adminMenuOption}>
    <TouchableOpacity onPress={handleAdminDashboardPress}>
      {/* Admin Dashboard menu item with badge */}
    </TouchableOpacity>
  </View>
)}
```

#### 4. Screen-Level Validation
```typescript
// src/screens/AdminDashboardScreen.tsx
useEffect(() => {
  // Check admin role on mount
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    Alert.alert(
      'Access Denied',
      'You do not have permission to access the admin dashboard.',
      [{ text: 'OK', onPress: onClose }]
    );
    return;
  }
  loadPendingTransactions();
}, []);
```

#### 5. Service-Layer Security
```typescript
// src/services/transactionService.ts
static async updateTransactionStatus(
  transactionId: string,
  status: TransactionStatus,
  failureReason?: string,
  processedBy?: string  // Admin user ID required
): Promise<boolean> {
  // Validate admin role before allowing status update
  if (processedBy) {
    const { data: adminUser } = await client.models.User.get({ id: processedBy });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'SUPER_ADMIN')) {
      console.error('[Transaction] Unauthorized: User is not an admin');
      return false;
    }
  }

  // Proceed with transaction status update
  // ...
}
```

### Security Layers

The admin system uses **defense in depth** with multiple security layers:

1. **UI Layer**: Admin options hidden from non-admin users (user convenience)
2. **Screen Layer**: Role validation when admin screens open (UI security)
3. **Service Layer**: Role validation before admin operations execute (business logic security)
4. **Database Layer**: Authorization rules limit transaction mutations (data security)

### Admin Functions

#### Approving Deposits
```typescript
// User requests deposit (creates PENDING transaction)
const deposit = await TransactionService.createDeposit(
  userId,
  100,
  paymentMethodId,
  'venmo-transaction-id'
);

// Admin approves (updates to COMPLETED and credits balance)
await TransactionService.updateTransactionStatus(
  deposit.id,
  'COMPLETED',
  undefined,
  adminUserId  // Admin role validated here
);
```

#### Rejecting Deposits/Withdrawals
```typescript
// Admin rejects with reason (updates to FAILED)
await TransactionService.updateTransactionStatus(
  transactionId,
  'FAILED',
  'Invalid Venmo transaction ID',
  adminUserId  // Admin role validated here
);
```

#### Viewing Pending Transactions
```typescript
// Get all pending transactions (admin dashboard)
const pending = await TransactionService.getPendingTransactions();
// Returns array of PENDING deposits/withdrawals with full details
```

### Granting Admin Access

To grant admin access to a user:

1. **Direct Database Update** (development/testing):
```typescript
await client.models.User.update({
  id: 'user-id-here',
  role: 'ADMIN'
});
```

2. **AWS Console** (production):
   - Open DynamoDB console
   - Find User table
   - Locate user by ID
   - Update `role` field to `ADMIN` or `SUPER_ADMIN`

3. **Future Enhancement**: Create admin management UI for SUPER_ADMIN to grant/revoke admin roles

### Admin Dashboard Features

- **Pending Transaction List**: View all deposits/withdrawals awaiting action
- **Filter by Type**: Filter to show only deposits or only withdrawals
- **Transaction Details**: View user ID, Venmo username, transaction ID, balances
- **Approve Action**: Green checkmark to approve and complete transaction
- **Reject Action**: Red X to reject with reason (prompts for explanation)
- **Real-time Updates**: Pull-to-refresh to get latest pending transactions
- **Stats Summary**: Count of total pending, deposits, and withdrawals

### Important Notes

- **Default Role**: All new users are created with `role: 'USER'`
- **Role Persistence**: Role is stored in User table and loaded into AuthContext on login
- **Admin Badge**: Admin dashboard menu item shows orange "ADMIN" badge for visibility
- **Validation Required**: `processedBy` parameter is required for TransactionService.updateTransactionStatus
- **Audit Trail**: All admin actions record the admin user ID in `processedBy` field
- **Notifications**: Users receive notifications when deposits/withdrawals are approved/rejected

## SideBet Design System Architecture

### Design System Overview
The app uses a comprehensive design system located in `src/styles/` that provides consistent styling across all platforms. **ALWAYS use design system tokens instead of hardcoded values.**

### Core Design Tokens
```typescript
import { colors, typography, spacing, shadows, textStyles, commonStyles } from '../styles';
```

#### Colors (`colors.*`)
- **Surface Colors**: `colors.background`, `colors.surface`, `colors.surfaceLight`
- **Text Colors**: `colors.textPrimary`, `colors.textSecondary`, `colors.textMuted`, `colors.textInverse`
- **Semantic Colors**: `colors.primary`, `colors.secondary`, `colors.success`, `colors.error`, `colors.warning`
- **Betting Colors**: `colors.live`, `colors.active`, `colors.pending`
- **UI Colors**: `colors.border`, `colors.divider`

#### Typography (`typography.*` and `textStyles.*`)
- **Font Scales**: `typography.fontSize.*` (xs, sm, base, lg, xl, 2xl, 3xl, 4xl)
- **Font Weights**: `typography.fontWeight.*` (normal, medium, semibold, bold, black)
- **Font Families**: `typography.fontFamily.*` (regular, bold, mono)
- **Pre-built Text Styles**: `textStyles.*` (h1-h4, body, bodySmall, caption, label, button, odds, amount, balance, pot, status)

#### Spacing (`spacing.*`)
- **Base Spacing**: `spacing.xs`, `spacing.sm`, `spacing.md`, `spacing.lg`, `spacing.xl`
- **Specialized Spacing**: `spacing.betting.*`, `spacing.card.*`, `spacing.button.*`, `spacing.padding.*`
- **Border Radius**: `spacing.radius.*` (xs, sm, md, lg, xl)

#### Shadows (`shadows.*`)
- **Component Shadows**: `shadows.card`, `shadows.betCard`, `shadows.liveBetCard`
- **Interactive Shadows**: `shadows.button`, `shadows.buttonPressed`
- **Layout Shadows**: `shadows.header`, `shadows.tabBar`

### Pre-built Component Styles (`commonStyles.*`)
**CRITICAL: Use these predefined patterns instead of creating custom styles**

#### Layout Patterns
```typescript
commonStyles.flexCenter       // Centered flex layout
commonStyles.flexBetween     // Space-between flex layout
commonStyles.backgroundCard  // Standard card background
commonStyles.border         // Standard border styling
```

#### Betting Components
```typescript
commonStyles.betCard         // Standard bet card layout
commonStyles.liveBetCard     // Live bet card with accent border
commonStyles.statusBadge     // Status indicator styling
```

#### Interactive Elements
```typescript
commonStyles.primaryButton   // Primary button styling
commonStyles.secondaryButton // Secondary button styling
commonStyles.textInput       // Standard text input styling
```

#### Navigation & Layout
```typescript
commonStyles.header          // Header component styling
commonStyles.tabBar          // Tab bar styling
commonStyles.screenContainer // Full screen container
commonStyles.safeArea        // Safe area container
```

### Design System Enforcement Rules

#### ✅ ALWAYS DO:
```typescript
// Use design system tokens
fontSize: typography.fontSize.base,
color: colors.textPrimary,
marginBottom: spacing.sm,
...textStyles.h4,
...commonStyles.betCard,
```

#### ❌ NEVER DO:
```typescript
// Hardcoded values
fontSize: 16,                    // Use typography.fontSize.base
color: '#333333',               // Use colors.textPrimary
marginBottom: 2,                // Use spacing.xs
fontWeight: '600',              // Use typography.fontWeight.semibold
fontFamily: 'System',           // Use typography.fontFamily.regular
gap: spacing.sm,                // NOT supported in React Native
paddingVertical: 2,             // Use spacing.xs/2 or similar
```

#### Component Development Pattern:
```typescript
const styles = StyleSheet.create({
  container: {
    ...commonStyles.betCard,        // Start with predefined pattern
    // Only add specific overrides if absolutely necessary
  },
  title: {
    ...textStyles.h4,              // Use predefined text style
    color: colors.textPrimary,     // Use semantic colors
    marginBottom: spacing.xs,      // Use spacing scale
  },
});
```

### Platform Consistency Guidelines
- **Typography**: Use `textStyles.*` patterns for consistent font rendering across iOS/Android
- **Android Typography**: Add `includeFontPadding: false` to small text styles for tighter rendering
- **Spacing**: Use `spacing.*` scale to ensure proper touch targets and visual hierarchy
- **Layout**: NEVER use `gap` property - use margins on child elements instead
- **Text Inputs**: Always include `textAlignVertical: 'center'` for Android alignment
- **Colors**: Use semantic color names (`colors.textPrimary`) not hex values for theme consistency
- **Shadows**: Use `shadows.*` patterns for proper elevation on both platforms

### Design System Validation
Before any component work:
1. Check if `commonStyles.*` has a matching pattern
2. Use `textStyles.*` for all typography needs
3. Verify all colors exist in `colors.*`
4. Confirm spacing values exist in `spacing.*`
5. Never hardcode numeric values for fonts, colors, or spacing

## Modal Standards

### Overview
**IMPORTANT**: When creating or modifying any modal component, you **MUST** follow the standardized modal pattern documented in [MODAL_STANDARDS.md](./MODAL_STANDARDS.md).

### Quick Reference for Modal Implementation

#### Required Modal Configuration
```typescript
import { ModalHeader } from '../components/ui/ModalHeader';
import { SafeAreaView } from 'react-native-safe-area-context';

<Modal
  visible={visible}
  animationType="slide"
  presentationStyle="fullScreen"  // ✅ REQUIRED - Never use "pageSheet"
  onRequestClose={onClose}         // ✅ REQUIRED - Android back button
>
  <SafeAreaView style={styles.container} edges={['top']}>
    <ModalHeader title="Modal Title" onClose={onClose} />
    {/* Modal content */}
  </SafeAreaView>
</Modal>
```

#### Why These Standards Exist
1. **Prevents Modal Stacking**: Using `ModalHeader` instead of custom headers prevents users from opening infinite modals
2. **ADA/WCAG Compliance**: Ensures 7.5:1+ contrast ratios for accessibility
3. **Consistency**: All modals follow identical UX patterns
4. **Platform Compatibility**: Proper safe area handling for notched devices

#### Key Rules
- ✅ **DO**: Always use `ModalHeader` component for modal headers
- ✅ **DO**: Use `presentationStyle="fullScreen"` for all modals
- ✅ **DO**: Wrap modal content in `SafeAreaView` with `edges={['top']}`
- ✅ **DO**: Use high contrast colors (`textPrimary` or `textSecondary`)
- ❌ **DON'T**: Create custom header layouts with logo, balance, or notification bell
- ❌ **DON'T**: Use `presentationStyle="pageSheet"` (causes header overlap issues)
- ❌ **DON'T**: Use `textMuted` for important modal content (fails ADA contrast)

#### Modal with Action Button Example
```typescript
<ModalHeader
  title="Send Feedback"
  onClose={onClose}
  rightComponent={
    <TouchableOpacity
      style={styles.submitButton}
      onPress={handleSubmit}
      disabled={!isValid}
    >
      <Text style={styles.submitButtonText}>Submit</Text>
    </TouchableOpacity>
  }
/>
```

#### Complete Documentation
For comprehensive details, examples, and accessibility requirements, see:
**[MODAL_STANDARDS.md](./MODAL_STANDARDS.md)**

This includes:
- Detailed component usage
- Accessibility compliance checklist
- Layout specifications
- Migration guide for existing modals
- Anti-patterns to avoid
- Code examples for all scenarios

## Claude Workflow Instructions

### Solution Proposal Process
When given a task or request, Claude should:

1. **Analyze & Plan**: First understand the full scope of the request and break it down into logical steps
2. **Propose Solution**: Present a clear, numbered plan of what will be done, including:
   - What files will be modified/created
   - What changes will be made to each file
   - Any potential risks or considerations
   - Expected outcome
3. **Wait for Approval**: Always wait for explicit user approval before proceeding with implementation
4. **Implement Step-by-Step**: Execute each step methodically, explaining what's being done
5. **Verify Results**: Test and verify the implementation works as expected

### Communication Style
- **Be Explicit**: Always explain what you're going to do before doing it
- **Show Context**: When making changes, show the relevant code sections being modified
- **Ask Before Major Changes**: Never make significant architectural decisions without discussion
- **Provide Options**: When multiple approaches are possible, present options with pros/cons
- **Use Todo Lists**: For complex multi-step tasks, use the Todo.md file to track changes and progress towards future changes

### Progress Reporting Guidelines
- **Long-running processes**: For builds, installs, or compilation that take >30 seconds, start the process and only report key milestones (start, major progress points, completion)
- **Avoid excessive monitoring**: Don't provide real-time updates for every build task or command output line
- **Background processes**: Run long processes in background and check periodically, not continuously
- **Key milestones only**: Report when processes begin, encounter errors, reach major checkpoints, or complete
- **Quiet work**: Work silently on routine tasks unless there are issues or completion notifications needed

### When to Pause for Approval
- Any file creation or deletion
- Significant code refactoring
- Dependency changes (package.json, etc.)
- Configuration changes (app.json, metro.config.js, etc.)
- Database schema or API changes
- Build or deployment related changes
- **PATH environment variable modifications** (shell configuration files like .bashrc, .zshrc, .profile, etc.)

### Implementation Guidelines
- Always read existing code first to understand patterns and conventions
- Maintain consistent code style with the existing codebase
- Test changes immediately after implementation when possible
- Explain any trade-offs or limitations of the chosen approach

## Comprehensive Error Detection Process

When encountering ANY errors, compilation failures, or build issues, **ALWAYS** follow this systematic debugging process:

### 1. Comprehensive TypeScript Check
```
- Run `mcp__ide__getDiagnostics` IMMEDIATELY for ALL scenarios:
  - Before starting any task
  - After making any code changes
  - When encountering runtime errors
  - JavaScript bundle loading errors
  - AppRegistryBinding failures
  - Build/compilation issues
  - Runtime crashes
  - Property access errors (like 'buttonPressed' does not exist)
- Fix ALL TypeScript errors AND warnings before proceeding
- Never assume TypeScript compilation is clean without verification
- Run diagnostics on ALL files, not just current working files
```

### 2. Build Error Monitoring
```
- Monitor ALL active background bash processes with BashOutput
- Check for compilation errors in Metro bundler output
- Look for runtime errors in build logs
- Check for property access errors in bundle compilation
- Verify all imported modules/properties exist in their respective files
```

### 3. Design System Consistency Check
```
- When using design tokens (colors, typography, shadows, spacing):
  - Verify the property exists in the design system file
  - Check for typos in property names (e.g., 'buttonPressed' vs 'button')
  - Ensure all referenced design tokens are exported properly
- Common design system files to verify:
  - src/styles/colors.ts
  - src/styles/typography.ts  
  - src/styles/shadows.ts
  - src/styles/spacing.ts
```

### 4. Dependency Compatibility Check
```
- Check React/React Native version compatibility
- Verify all dependencies support current framework versions
- Look for peer dependency warnings in npm/yarn output
```

### 5. Configuration Issues Check
```
- Verify app.json/expo configuration
- Check metro.config.js for resolver issues
- Ensure JavaScript engine (Hermes vs JSC) matches framework requirements
```

### 6. Native Module Integration Check
```
- Verify react-native-gesture-handler imports
- Check SafeAreaProvider setup
- Ensure all native dependencies are properly installed
```

### CRITICAL RULES for Error Prevention:
1. **Always run `mcp__ide__getDiagnostics` BEFORE and AFTER every change**
2. **Never assume design system properties exist - always verify**
3. **Check ALL build outputs with BashOutput for hidden errors**
4. **Test every property access against the actual exported object**
5. **Never skip error checking even for "simple" changes**

### Tools to Use Proactively (EVERY TIME):
- `mcp__ide__getDiagnostics` - Check for ALL compilation errors/warnings
- `BashOutput` - Monitor ALL background build processes for errors
- `Read` - Verify design system files contain referenced properties
- `npm run android` - Test builds end-to-end  
- `Bash` with build commands - Verify configuration changes

