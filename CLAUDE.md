# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the SideBet React Native app.

## Common Commands

- **Development**: `npm start` - Start Expo development server
- **Android**: `npm run android` - Run on Android device/emulator
- **iOS**: `npm run ios` - Run on iOS device/simulator
- **Web**: `npm run web` - Run in web browser (for testing)

## Architecture Overview

This is the SideBet app - a professional peer-to-peer betting platform built with React Native + Expo for Android and iOS deployment, using AWS Amplify Gen2 for backend services.

### Project Structure
- **App.tsx** - Main entry point with Amplify configuration and AuthProvider
- **src/MainApp.tsx** - Main app component with authentication routing and betting functionality
- **src/contexts/AuthContext.tsx** - Authentication context provider managing user state
- **src/hooks/useAuth.ts** - Custom hook for accessing authentication context  
- **src/components/Login.tsx** - Native login form using React Native components
- **src/components/SignUp.tsx** - Native signup form with email confirmation flow

### Authentication System
- **Custom Native UI**: Uses React Native components (TextInput, TouchableOpacity, etc.)
- **AWS Cognito**: Uses AWS Cognito for secure authentication
- **Native UX**: Uses Alert.alert() for error messages and native modals for bet creation
- **Loading States**: Native ActivityIndicator components
- **Form Validation**: Native keyboard types and input validation

### Backend Integration  
- **AWS Amplify Gen2**: Modern serverless backend with GraphQL API
- **Real-time Data**: GraphQL subscriptions with `observeQuery()` for live betting updates
- **DynamoDB**: NoSQL database for betting data, user profiles, and transactions
- **Mobile Optimizations**: Uses `@aws-amplify/react-native` for native performance

### Native Features
- **Platform-specific Styling**: Uses StyleSheet for native performance
- **Touch Interactions**: TouchableOpacity for button interactions  
- **Native Navigation**: Ready for React Navigation if needed
- **Keyboard Handling**: Proper keyboard types for email/password inputs
- **Native Alerts**: Platform-appropriate alert dialogs

### Development Notes
- **Hot Reload**: Expo provides fast refresh during development
- **Platform Testing**: Test on both iOS and Android simulators/devices
- **Backend Sync**: Any changes to Amplify backend automatically sync to mobile app
- **Deployment**: Ready for Android Play Store and iOS App Store submission

### Key Differences from Web Version
- **Components**: React Native components instead of HTML elements
- **Styling**: StyleSheet instead of CSS
- **User Interaction**: TouchableOpacity instead of button clicks
- **Text Input**: TextInput with native keyboard support
- **Lists**: FlatList for performant bet list rendering
- **Alerts**: Native Alert API instead of web alerts

### Android Deployment Preparation
- Expo handles most Android configuration automatically
- APK/AAB generation ready through Expo Application Services (EAS)
- Native app store optimization built-in

## Recent Enhancements (2025 Session)

### User Feedback System ✅
- **FeedbackModal Component**: Professional feedback collection UI with type selection (Bug, Feature, Improvement, Question)
- **GitHub Integration**: Automatic issue creation in GitHub repository (spyderbr6/betty)
- **Environment Variables**: Secure token management via `.env` file with react-native-dotenv
- **Header Integration**: Ellipsis button in Header component opens feedback modal
- **Configuration**: `src/utils/github.ts` handles API integration, `types/env.d.ts` for TypeScript support

### Simplified Betting System ✅
- **Removed Complex Odds**: Eliminated American odds format (+/-110) for peer-to-peer betting
- **Side Names Only**: Kept customizable side names (Home/Away, Yes/No, etc.) for clarity
- **Updated Components**: BetCard, CreateBetScreen, LiveEventsScreen, ResolveScreen all simplified
- **Type Safety**: Updated BetOdds interface to only include sideAName and sideBName

### UI/UX Improvements ✅
- **Category Removal**: Removed redundant category selector from bet creation (templates provide organization)
- **Bet Creation Flow**: Auto-scroll to top after bet creation, improved form reset behavior
- **Status Filtering**: Fixed My Bets status filters to properly show RESOLVED bets
- **Real-time Updates**: Enhanced participant count tracking and balance synchronization

### Architecture Updates ✅
- **Environment Setup**: Babel config updated for react-native-dotenv support
- **Security**: .env file properly gitignored to protect GitHub tokens
- **TypeScript**: All compilation errors resolved, proper type definitions added
- **JSON Parsing**: Fixed bet data JSON parsing in all screens for proper odds display

### Configuration Files Updated
- **babel.config.js**: Added react-native-dotenv plugin for environment variable support
- **.env**: Contains GITHUB_TOKEN for API integration (gitignored for security)
- **types/env.d.ts**: TypeScript declarations for @env module
- **.gitignore**: Updated to exclude .env and other sensitive files

### Current Status (Session End)
- **Development Server**: Running with environment variable support
- **User Feedback System**: Fully functional with GitHub integration
- **Betting System**: Simplified and working correctly
- **All TypeScript Errors**: Resolved and verified clean compilation

### Remaining Small Enhancements (from todo.md)
- Remove "search bets" from header, add to My Bets and Live Bets with search icon
- Wire up bet screen "new bet" button to create bet page
- Move filter selection under "my bets" header
- Update main menu "create" icon styling (yellow circle contrast issue)
- Revalidate create bet defaults after bet creation
- Define bet resolution time criteria and display logic

## Friend Management & Bet Invitation System ✅

### System Overview
The SideBet app features a comprehensive social betting platform with friend management and invitation capabilities, enabling users to connect with friends and invite them to bets seamlessly.

### Core Features Implemented

#### 🔄 **Friend Management System**
- **Friend Requests**: Send, accept, and decline friend requests with real-time notifications
- **Bilateral Friendships**: Efficient friendship modeling using lexicographic ordering for optimal queries
- **Friend Discovery**: Search users by username, email, or display name
- **Profile Integration**: Display names and profile picture support for enhanced user experience

#### 📱 **Enhanced User Interface**
- **Friends Screen**: Comprehensive friend list management with action menus and profile cards
- **Add Friend Modal**: User search and friend request sending with relationship status detection
- **Friend Requests Modal**: Incoming friend requests with accept/decline functionality
- **Profile Editor**: Editable display names and profile picture placeholders with avatar initials

#### 🎯 **Streamlined Bet Invitation Flow**
- **Create Bet Integration**: Friend selection during bet creation for immediate invitations
- **Top Friends Display**: Visual avatar selection showing top 4 friends with "See More" expansion
- **Flexible Side Choice**: Recipients choose their preferred side (A or B) when accepting invitations
- **Invitation Cards**: Prominent display of pending invitations in main BetsScreen with enhanced UI

#### 🔔 **Notification & Event System**
- **Real-time Notifications**: Comprehensive event tracking for all friend and betting activities
- **Centralized Service**: `NotificationService` handles all notification types with push notification readiness
- **Event Types**: Friend requests, bet invitations, bet resolutions, deadline alerts, and system announcements
- **Smart Filtering**: Efficient querying with unread counts and notification cleanup

### Database Schema Architecture

#### **Core Models**
```typescript
// User Profile Enhancement
User {
  displayName?: string        // Friendly display name
  profilePictureUrl?: string  // S3 profile picture URL
  // ... existing fields
}

// Friend Management
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

// Bet Invitations
BetInvitation {
  betId: string
  fromUserId: string
  toUserId: string
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
  message?: string
  invitedSide: string      // Empty string for flexible choice
  expiresAt: datetime      // 24-hour expiration
}

// Notification System
Notification {
  userId: string
  type: NotificationType
  title: string
  message: string
  isRead: boolean
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  actionType?: string      // Deep linking support
  actionData?: json        // Action metadata
  relatedBetId?: string
  relatedUserId?: string
}
```

### Key Implementation Details

#### **Friend Selection in CreateBetScreen**
- **Visual Interface**: Horizontal scrollable friend avatars with selection checkmarks
- **Quick Selection**: Top 4 friends displayed prominently with remaining count indicator
- **Batch Invitations**: All selected friends receive invitations automatically upon bet creation
- **Form Integration**: Selected friends reset when bet creation form is cleared

#### **Flexible Invitation Acceptance**
- **Dynamic Side Choice**: Users prompted to choose A or B when accepting open invitations
- **Native Alerts**: Clean iOS/Android native alert dialogs for side selection
- **Smart UI**: Invitation cards hide "Your side" when no specific side is assigned
- **Enhanced Feedback**: Success messages show exactly which side user joined

#### **Notification Architecture**
- **Dual Approach**: Both relationship queries and dedicated notification log for efficiency
- **Push Ready**: Infrastructure prepared for expo-notifications integration
- **Event Coverage**: All friend and betting activities generate appropriate notifications
- **Cleanup System**: Automatic deletion of old notifications to prevent database bloat

### File Structure

#### **New Components**
- `src/screens/FriendsScreen.tsx` - Friend list management interface
- `src/components/ui/AddFriendModal.tsx` - User search and friend request sending
- `src/components/ui/FriendRequestsModal.tsx` - Incoming friend requests management
- `src/components/ui/ProfileEditor.tsx` - User profile editing modal
- `src/services/notificationService.ts` - Centralized notification management

#### **Enhanced Components**
- `src/screens/CreateBetScreen.tsx` - Added friend selection section with visual avatars
- `src/screens/BetsScreen.tsx` - Integrated bet invitation cards with side choice
- `src/screens/AccountScreen.tsx` - Enhanced with Friends navigation and profile display
- `src/components/SignUp.tsx` - Captures display name during registration

#### **Schema & Types**
- `amplify/data/resource.ts` - Extended with friend management and notification models
- `src/types/betting.ts` - Added friend management types and notification interfaces

### User Experience Flow

#### **Making Friends**
1. Navigate to Friends screen from Account
2. Tap "Add Friend" → Search by username/email
3. Send friend request with optional message
4. Recipient gets notification and can accept/decline
5. Bilateral friendship created upon acceptance

#### **Creating Bets with Friends**
1. Open Create Bet screen → Select template and fill details
2. Scroll to "INVITE FRIENDS" section → Tap friend avatars to select
3. Create bet → Selected friends automatically receive invitations
4. Form resets and clears friend selections

#### **Accepting Bet Invitations**
1. Invitations appear prominently at top of main BetsScreen
2. Tap "Accept & Join" → Choose side (A or B) from native alert
3. Join bet on chosen side → Notification sent to inviter
4. Invitation removed from list and bet updated

### Technical Features
- **Type Safety**: Full TypeScript coverage for all friend management features
- **Real-time Updates**: GraphQL subscriptions ready for live friend status updates
- **Efficient Queries**: Optimized friendship queries using bilateral modeling
- **Error Handling**: Graceful failure handling for all friend and invitation operations
- **Migration Ready**: Backward compatibility for existing users without display names

## Profile Picture Upload System ✅

### System Overview
The SideBet app now features a complete profile picture upload system, enabling users to upload, store, and manage their profile images through AWS S3 storage with seamless integration into the user profile system.

### Core Features Implemented

#### 📷 **Image Upload Workflow**
- **Permission Management**: Automatic camera and photo library permission requests
- **Image Selection**: Native image picker with square crop and quality optimization
- **S3 Upload**: Secure file uploads to AWS S3 with proper access controls
- **URL Generation**: Long-lived public URLs for profile picture access
- **Old Image Cleanup**: Automatic deletion of previous profile pictures to prevent storage bloat

#### 🔐 **AWS Storage Integration**
- **S3 Bucket Configuration**: Dedicated storage bucket with proper access policies
- **File Organization**: Profile pictures stored in user-specific folders (`profile-pictures/{userId}/`)
- **Access Control**: Entity-based access allowing users to manage their own pictures
- **Content Type Handling**: Proper MIME type detection and storage optimization

#### 🎨 **Enhanced User Interface**
- **ProfileEditor Component**: Integrated image upload with loading states and visual feedback
- **Avatar Placeholders**: Fallback to user initials when no profile picture is set
- **Real-time Updates**: Immediate UI updates after successful uploads
- **Error Handling**: Comprehensive error messages and retry mechanisms

### Implementation Details

#### **Storage Architecture**
```typescript
// AWS S3 Storage Configuration
defineStorage({
  name: 'sidebet-user-uploads',
  access: (allow) => ({
    'profile-pictures/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete'])
    ]
  })
})
```

#### **Image Upload Service**
```typescript
// Core upload functionality
updateProfilePicture(userId, currentProfilePictureUrl?) -> {
  1. Request permissions (camera + photo library)
  2. Launch image picker with square aspect ratio
  3. Upload to S3 with unique filename
  4. Generate public URL with 1-year expiry
  5. Delete old profile picture (if exists)
  6. Return new profile picture URL
}
```

#### **Database Integration**
- **User Model Enhancement**: `profilePictureUrl` field stores S3 URLs
- **Profile Updates**: Seamless integration with existing profile edit workflow
- **Real-time Sync**: Profile picture changes immediately reflected across the app
- **Avatar Generation**: Automatic fallback to initials when no picture is uploaded

### Files Enhanced

#### **Backend Infrastructure**
- ✅ `amplify/storage/resource.ts` - S3 storage configuration with proper access controls
- ✅ `amplify/backend.ts` - Storage integration into Amplify backend
- ✅ Package dependencies updated with `expo-image-picker`

#### **Frontend Components**
- ✅ `src/services/imageUploadService.ts` - Complete image upload workflow service
- ✅ `src/components/ui/ProfileEditor.tsx` - Enhanced with real image upload functionality
- ✅ `src/screens/AccountScreen.tsx` - Integrated profile picture saving to database

#### **User Experience Flow**
1. **Access Profile Editor**: Tap profile picture or edit profile button
2. **Upload Image**: Tap camera icon → Grant permissions → Select/crop image → Upload to S3
3. **Real-time Preview**: See uploaded image immediately in profile editor
4. **Save Profile**: Profile picture URL saved to user database record
5. **App-wide Updates**: New profile picture appears throughout the app (friend lists, bet cards, etc.)

### Technical Features
- **Expo Integration**: Native image picker with platform-specific optimizations
- **AWS S3 Storage**: Scalable cloud storage with CDN-ready URLs
- **Permission Handling**: Graceful camera and photo library permission management
- **Image Optimization**: Automatic compression and format optimization for mobile
- **Error Recovery**: Robust error handling with user-friendly messages
- **Loading States**: Visual feedback during upload process with activity indicators

### Security & Performance
- **Access Control**: Users can only access their own profile pictures
- **File Validation**: Content type validation and file size limits
- **Storage Cleanup**: Automatic deletion of old images to prevent storage bloat
- **CDN Integration**: S3 URLs ready for CloudFront CDN acceleration
- **Mobile Optimization**: Compressed images optimized for mobile bandwidth

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

