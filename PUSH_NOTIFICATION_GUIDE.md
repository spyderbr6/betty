# Push Notification Setup & Testing Guide

## Overview

SideBet uses **Expo Push Notifications** for cross-platform push notifications on iOS and Android. This guide explains how the system works and how to test it.

## Architecture

```
User Action → AWS Lambda → Expo Push API → Expo's FCM/APNS → User Device
              (Backend)    (via HTTPS)      (Managed by Expo)
```

### Key Components

1. **Database Models** (DynamoDB)
   - `PushToken` - Stores Expo push tokens for each user's device
   - `Notification` - Stores notification records for in-app display
   - `NotificationPreferences` - User preferences for notification delivery

2. **Frontend Services**
   - `NotificationService` - Registers push tokens, creates notifications
   - `pushNotificationConfig` - Handles push notification taps and navigation
   - `notificationNavigationHandler` - Maps notification types to app screens

3. **Backend Lambda**
   - `push-notification-sender` - Sends push notifications via Expo Push API
   - Triggered via GraphQL mutation: `sendPushNotification`

4. **Navigation Integration**
   - AppNavigator wires push notification taps to screen navigation
   - Uses same navigation logic as toast notifications
   - Supports deep linking to bets, friend requests, transactions, etc.

## How Push Notifications Work

### 1. Token Registration (On Login)
```typescript
// Happens automatically in AuthContext.tsx
await NotificationService.registerPushToken(userId);
```

**What it does:**
- Requests notification permissions from OS
- Gets Expo push token from Expo servers
- Stores token in DynamoDB `PushToken` table
- Token format: `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`

### 2. Notification Creation
```typescript
// Called from your app when events occur (e.g., bet resolved, friend request)
await NotificationService.createNotification({
  userId: 'user-123',
  type: 'BET_RESOLVED',
  title: 'You Won!',
  message: 'You won $50 on "Lakers vs Celtics"!',
  priority: 'HIGH',
  relatedBetId: 'bet-456',
  sendPush: true  // Triggers push notification
});
```

**What it does:**
1. Creates record in DynamoDB `Notification` table
2. Shows in-app toast (if user has app open)
3. Calls Lambda function to send push notification
4. Lambda sends via Expo Push API

### 3. Push Notification Delivery
```typescript
// Lambda function: push-notification-sender/handler.ts
// Sends to Expo Push API: https://exp.host/--/api/v2/push/send
```

**Flow:**
1. Lambda gets user's active push tokens from DynamoDB
2. Sends batch request to Expo Push API
3. Expo routes to FCM (Android) or APNS (iOS)
4. Device receives notification
5. Lambda updates token's `lastUsed` timestamp

### 4. Notification Tap Handling
```typescript
// When user taps notification:
// 1. pushNotificationConfig.handleNotificationResponse() extracts data
// 2. Calls navigation callback registered in AppNavigator
// 3. Uses notificationNavigationHandler to determine screen
// 4. Navigates user to appropriate screen/modal
```

## Why No Firebase Setup Needed?

**Expo manages FCM credentials for you automatically** when you use EAS Build:

- **Development builds**: Expo provides development FCM credentials
- **Production builds**: Expo generates production FCM credentials
- **No google-services.json needed**: EAS Build handles this
- **No Firebase Console access needed**: All managed by Expo

### How Expo Does This

1. When you run `eas build`, Expo's build servers:
   - Create FCM project (if needed) linked to your EAS project
   - Generate FCM server key and upload to Expo's push service
   - Include FCM credentials in your APK/IPA

2. When you send push notifications:
   - Your Lambda sends to Expo Push API
   - Expo routes to FCM/APNS using managed credentials
   - No Firebase setup required on your end

## Testing Push Notifications

### Prerequisites

1. **Physical device required** - Push notifications don't work in simulators/emulators
2. **EAS Build required** - Development builds have proper push credentials
3. **User account** - Must be logged in to register push token

### Step 1: Build Development Client

```bash
# Build for Android (recommended for testing)
npx eas build --profile development --platform android

# Build for iOS (requires Apple Developer account)
npx eas build --profile development --platform ios
```

**Note:** This build process takes 10-20 minutes and runs on Expo's servers.

### Step 2: Install on Physical Device

1. Download build from Expo dashboard: https://expo.dev/accounts/bursicd/projects/sidebet/builds
2. Install on your Android device (enable "Install from Unknown Sources")
3. Launch the app

### Step 3: Verify Push Token Registration

1. Sign in to your account
2. Check logs for:
   ```
   [Push] Token registered successfully: ExponentPushToken[xxxxxx...]
   ```

3. Verify token in database:
   ```typescript
   // Query DynamoDB PushToken table
   // Should see entry with your userId and token
   ```

### Step 4: Trigger Test Notification

**Option A: From Another User's Account**
1. Have friend send you a bet invitation
2. Should receive push notification on device
3. Tap notification → should navigate to bet invitation

**Option B: Use Lambda Function Directly**
```typescript
// Call from your app or AWS Console
const { data } = await client.mutations.sendPushNotification({
  userId: 'your-user-id',
  title: 'Test Notification',
  message: 'Testing push notifications!',
  data: {
    type: 'SYSTEM_ANNOUNCEMENT',
    actionType: 'view_notifications'
  },
  priority: 'HIGH'
});
```

**Option C: Create Test Notification via NotificationService**
```typescript
// Add this temporarily to CreateBetScreen or anywhere
await NotificationService.createNotification({
  userId: user.userId, // Your own user ID
  type: 'BET_RESOLVED',
  title: 'Test Push',
  message: 'This is a test push notification!',
  priority: 'HIGH',
  sendPush: true,
  relatedBetId: 'test-bet-id'
});
```

### Step 5: Test Navigation

Tap the notification on your device. It should:
1. Open the app (if closed)
2. Navigate to the appropriate screen based on notification type
3. Show relevant data (bet details, friend request, etc.)

### Expected Notification Types & Navigation

| Notification Type | Tap Action |
|------------------|------------|
| `BET_RESOLVED` | Navigate to Resolve screen (bet details) |
| `BET_INVITATION_RECEIVED` | Navigate to Account screen (invitation modal) |
| `FRIEND_REQUEST_RECEIVED` | Navigate to Account screen (friend requests) |
| `DEPOSIT_COMPLETED` | Navigate to Account screen (transaction history) |
| `BET_DEADLINE_APPROACHING` | Navigate to Resolve screen |
| `SYSTEM_ANNOUNCEMENT` | Navigate to Account screen (notifications) |

## Troubleshooting

### "No push token registered"
**Cause:** Device didn't get Expo push token
**Fix:**
1. Ensure using EAS development build (not Expo Go)
2. Check notification permissions granted
3. Verify device has internet connection
4. Check logs for error messages

### "Push notification not received"
**Causes:**
1. **User has notifications disabled** - Check NotificationPreferences
2. **Token not registered** - User must be logged in
3. **Priority too low** - Only HIGH/URGENT priority trigger push
4. **DND mode active** - Check user's Do Not Disturb settings
5. **Lambda function failed** - Check CloudWatch logs

**Debug Steps:**
```typescript
// 1. Verify notification was created
const notifications = await NotificationService.getUserNotifications(userId);
console.log('Recent notifications:', notifications);

// 2. Check if push was sent
// Look in CloudWatch logs for push-notification-sender Lambda

// 3. Verify user has active push token
const { data: tokens } = await client.models.PushToken.list({
  filter: { userId: { eq: userId }, isActive: { eq: true } }
});
console.log('Active tokens:', tokens);
```

### "Notification received but navigation doesn't work"
**Cause:** Navigation callback not registered or data missing
**Fix:**
1. Check console logs for `[Push] Navigation callback registered`
2. Verify notification data includes `type` field
3. Check AppNavigator wired up correctly

### "Firebase error on Android"
**Cause:** Using `expo start` or `expo run:android` instead of EAS build
**Fix:**
- Use EAS development build: `npx eas build --profile development --platform android`
- Development client includes proper FCM credentials

## Production Deployment

### Building for Production

```bash
# Android
eas build -p android --profile production

# iOS (requires Apple Developer account + APNS certificates)
eas build -p ios --profile production
```

### iOS APNS Setup (Required for iOS Production)

1. **Apple Developer Portal:**
   - Create App ID for `com.sidebet.app`
   - Enable Push Notifications capability
   - Create APNS Key (or Certificate)

2. **Upload to Expo:**
   ```bash
   eas credentials
   # Select iOS → Push Notifications → Upload APNS Key
   ```

3. **Build & Submit:**
   ```bash
   eas build -p ios --profile production
   eas submit -p ios
   ```

### Production Expo Access Token (Optional)

For higher push notification limits (>1M/month):

1. Get Expo access token: https://expo.dev/accounts/bursicd/settings/access-tokens
2. Add to Lambda environment:
   ```typescript
   // amplify/functions/push-notification-sender/resource.ts
   environment: {
     EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN || '',
   }
   ```
3. Update Lambda handler to use token:
   ```typescript
   headers: {
     'Authorization': `Bearer ${env.EXPO_ACCESS_TOKEN}`,
   }
   ```

## Monitoring & Analytics

### CloudWatch Logs

**Lambda Function:** `push-notification-sender`
- View push notification send results
- Track delivery failures
- Monitor token invalidation

**Key Metrics to Monitor:**
- Push notification delivery rate
- Token registration rate
- Failed sends (DeviceNotRegistered errors)
- Notification tap-through rate

### Database Queries

**Active Push Tokens:**
```typescript
const { data: tokens } = await client.models.PushToken.list({
  filter: { isActive: { eq: true } }
});
console.log(`Total active tokens: ${tokens?.length}`);
```

**Recent Notifications:**
```typescript
const { data: recent } = await client.models.Notification.list({
  limit: 100
});
const sent = recent?.filter(n => n.priority === 'HIGH' || n.priority === 'URGENT');
console.log(`Push notifications sent: ${sent?.length}`);
```

## FAQ

### Q: Do I need a Firebase project?
**A:** No! Expo manages FCM credentials for you when using EAS Build.

### Q: Can I test on iOS Simulator?
**A:** No, push notifications only work on physical devices.

### Q: Why am I not receiving notifications?
**A:** Check:
1. Using EAS development build (not Expo Go)
2. Logged in and push token registered
3. Notification priority is HIGH or URGENT
4. Not in Do Not Disturb window
5. Notifications enabled in device settings

### Q: How do I send a notification from Lambda?
**A:** Use the GraphQL mutation:
```typescript
const { data } = await client.mutations.sendPushNotification({
  userId: 'user-123',
  title: 'Bet Resolved',
  message: 'You won $50!',
  priority: 'HIGH'
});
```

### Q: What's the difference between in-app and push notifications?
**A:**
- **In-app (Toast):** Shows when app is open, uses ToastNotificationService
- **Push:** Shows when app is closed/background, uses Expo Push API
- Both use same navigation logic when tapped

### Q: How much does Expo Push cost?
**A:**
- Free tier: 1,000,000 notifications/month
- Beyond that: $0.002 per notification
- For most apps: Free tier is sufficient

## Summary

✅ **Push notifications fully integrated** - Token registration, Lambda sender, navigation
✅ **No Firebase setup needed** - Expo manages FCM credentials
✅ **Cross-platform** - Works on iOS (APNS) and Android (FCM)
✅ **Deep linking** - Tapping notifications navigates to relevant screens
✅ **User preferences** - Respects notification settings and DND mode

**Next steps:**
1. Build development client: `npx eas build --profile development --platform android`
2. Install on device and test notification flow
3. Verify navigation works when tapping notifications
4. Deploy to production when ready
