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

## Firebase Setup IS Required (Android)

> This section previously claimed Expo manages FCM credentials automatically and
> that no Firebase setup was needed. That is wrong, and it is why Android push
> never worked. Running the SDK 57 build on an emulator produced:
>
> ```
> [Push] Firebase not configured. Push notifications require Firebase setup for Android.
> ```
>
> No token registers, so no Android device can receive a push.

Expo routes Android pushes through FCM, and since the FCM V1 migration you must
supply your own credentials. **iOS** works without extra setup; **Android** does not.

### Two files, easy to confuse

| File | Contents | Handling |
| --- | --- | --- |
| `google-services.json` | Public identifiers | Committed at the repo root, referenced by `app.json` |
| Service account JSON | **Private key** | Never commit — upload to EAS only (gitignored by pattern) |

### Setup

1. Create a Firebase project and add an Android app with package name
   `com.sidebet.app` — it must match `app.json` exactly or tokens will not register.
2. Download `google-services.json` to the repo root. `app.json` already points at
   it via `android.googleServicesFile`.
3. Firebase Console -> Project Settings -> Service Accounts -> Generate new private
   key. This is the secret half.
4. Upload that key to EAS:

```bash
eas credentials
# Android -> production -> Google Service Account
# -> Manage your Google Service Account Key for Push Notifications (FCM V1)
# -> Upload a new service account key
```

   Or via the EAS dashboard: Project Settings -> Credentials -> Android -> FCM V1.

5. Rebuild. Credentials are baked in at build time, so an existing APK will not
   pick them up.

### Note on the native project

`android/` is committed, so EAS does not run prebuild and the google-services
Gradle plugin must already be applied there. Setting `googleServicesFile` in
`app.json` alone is not enough — run `npx expo prebuild --platform android --clean`
so the plugin and the file land in `android/`. That command also drops
`android/local.properties`, which is gitignored; recreate it with your `sdk.dir`
afterwards or local Gradle builds fail with "SDK location not found".

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

---

# Web Push

Merged from the former `WEB_PUSH_GUIDE.md`. Push is one subject with three
platforms, and keeping web in a separate file is how the two drifted: that file
still described Android as needing no Firebase setup long after that stopped
being true.

Web uses the browser Push API with a VAPID keypair rather than Expo/FCM. The
public half is hardcoded in `src/utils/webPushUtils.ts` and mirrored as the
`WEB_PUSH_PUBLIC_KEY` default in the sender function; the private half is an
Amplify secret (`VAPID_PRIVATE_KEY`). **Both halves must be from the same
keypair** — a mismatch surfaces as a 403 from the browser push service, not a
crash, so it is easy to misread as "push is just broken".

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    SideBet Push Notifications                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Frontend (Platform Detection)                                │
│  └─ NotificationService.registerPushToken()                   │
│     ├─ iOS/Android → Expo Push Token                          │
│     └─ Web → Web Push Subscription (VAPID)                    │
│                                                                │
│  Database (DynamoDB)                                           │
│  └─ PushToken table                                            │
│     └─ platform: IOS | ANDROID | WEB                          │
│                                                                │
│  Backend (AWS Lambda)                                          │
│  └─ push-notification-sender                                   │
│     ├─ Expo tokens → Expo Push API                            │
│     └─ Web tokens → Web Push API (VAPID)                      │
│                                                                │
│  Service Workers (Web Only)                                    │
│  └─ public/service-worker.js                                   │
│     └─ Handles push events & navigation                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. VAPID Keys

**Public Key (Client-side)**:
```
BHREIE9gIc8ok6jMDRv0eGw_SUmAN77dav_Z5AJ1H8dM2oPBpk4YEvnIVP76-z2gqvZvkBsO9bxx_5Sk1BYlK9I
```

⚠️ **SECURITY NOTE**: The original private key was accidentally exposed and should be rotated. See VAPID_KEYS.md for rotation instructions.

**Private Key Management**:
- 🔒 Stored as Amplify secret: `VAPID_PRIVATE_KEY`
- 📍 Configured in: `amplify/backend.ts`
- ✅ Never hardcoded in source code
- 🚫 Never committed to git

**Setting the Secret**:
```bash
# For sandbox/development
npx ampx sandbox secret set VAPID_PRIVATE_KEY

# For production
npx ampx secret set VAPID_PRIVATE_KEY --branch main
```

### 2. Web Push Utils (`src/utils/webPushUtils.ts`)

Provides browser-side utilities for web push:

```typescript
// Check if web push is supported
isWebPushSupported(): boolean

// Request notification permission
requestNotificationPermission(): Promise<NotificationPermission>

// Register service worker
registerServiceWorker(): Promise<ServiceWorkerRegistration>

// Subscribe to web push
subscribeToWebPush(): Promise<string>

// Unsubscribe from web push
unsubscribeFromWebPush(): Promise<void>

// Get current subscription
getWebPushSubscription(): Promise<PushSubscription | null>
```

### 3. Updated NotificationService

**Platform-Conditional Registration**:

```typescript
// Automatically detects platform and registers appropriate token
await NotificationService.registerPushToken(userId);

// On web: Creates Web Push subscription
// On mobile: Gets Expo Push Token

// New method for unregistering
await NotificationService.unregisterPushToken(userId);
```

### 4. Service Worker (`public/service-worker.js`)

Handles push notifications when the web app is closed or in background:

**Features**:
- Receives push notifications
- Displays notification to user
- Handles notification clicks (deep linking)
- Auto-navigation to relevant screens

**Deep Linking Support**:
- Bet notifications → `/bet/:betId`
- Friend requests → `/account?tab=friends`
- Transactions → `/account?tab=transactions`
- System announcements → `/account?tab=notifications`

### 5. Lambda Function (`push-notification-sender`)

**Dual Platform Support**:

```typescript
// Automatically separates tokens by platform
const mobileTokens = tokens.filter(t => t.platform === 'IOS' || t.platform === 'ANDROID');
const webTokens = tokens.filter(t => t.platform === 'WEB');

// Sends via appropriate service
await sendViaExpoPush(mobileTokens, ...);    // iOS/Android
await sendViaWebPush(webTokens, ...);         // Web browsers
```

**Environment Variables**:
- `WEB_PUSH_PUBLIC_KEY`: VAPID public key
- `WEB_PUSH_PRIVATE_KEY`: VAPID private key
- `WEB_PUSH_EMAIL`: Contact email for VAPID

---

## Setup & Deployment

### 1. Install Dependencies (Already Done)

The Lambda function already includes `web-push`:

```json
{
  "dependencies": {
    "web-push": "^3.6.7"
  }
}
```

### 2. Deploy Backend Changes

```bash
# Deploy Amplify backend with updated Lambda function
npx ampx sandbox

# Or for production
npx ampx deploy
```

This will:
- Update Lambda function with web push support
- Add VAPID keys to Lambda environment
- Update PushToken schema (already supports WEB platform)

### 3. Build & Deploy Web App

```bash
# Build web version
npx expo export:web

# Deploy to Amplify Hosting
# (Amplify Hosting automatically serves static files from web-build/)
```

### 4. Verify Service Worker

The service worker must be accessible at:
```
https://your-domain.com/service-worker.js
```

**Important**: Service workers only work over HTTPS (except localhost for testing).

---

## Testing Web Push Notifications

### Prerequisites

1. **HTTPS Required**: Web push only works on:
   - `https://` domains
   - `localhost` (for development)

2. **Supported Browsers**:
   - Chrome/Edge (desktop & mobile)
   - Firefox (desktop & mobile)
   - Safari (desktop only, iOS Safari doesn't support web push yet)

### Step 1: Enable Web App

```bash
# Start Expo web dev server
npm start
# Press 'w' to open in web browser
```

### Step 2: Register for Push Notifications

1. Open the web app in your browser
2. Sign in to your account
3. Check browser console for:
   ```
   [Push] Registering web push token...
   [Web Push] Service worker registered
   [Web Push] New subscription created
   [Push] Web push token registered successfully
   ```

4. Browser should prompt for notification permission
5. Click "Allow"

### Step 3: Verify Token in Database

Check DynamoDB `PushToken` table for entry with:
- `platform: 'WEB'`
- `token: '{"endpoint":"https://...","keys":{...}}'`
- `isActive: true`

### Step 4: Send Test Notification

**Option A: From Another User**
1. Have friend send you a bet invitation or friend request
2. You should receive a browser notification

**Option B: Manual Lambda Invocation**
```typescript
// Call from AWS Console or your app
await client.mutations.sendPushNotification({
  userId: 'your-user-id',
  title: 'Test Web Push',
  message: 'This is a test notification!',
  priority: 'HIGH'
});
```

### Step 5: Test Notification Click

1. Click the notification in your browser
2. Should open/focus the web app
3. Should navigate to the appropriate screen based on notification type

---

## Browser Console Debugging

### Expected Console Output (Successful Registration)

```
[Push] Registering web push token...
[Web Push] Service worker registered: https://localhost:8081/
[Web Push] Service worker ready
[Web Push] New subscription created
[Push] Web push token registered successfully
```

### Expected Console Output (Receiving Notification)

```
[Service Worker] Push notification received
[Service Worker] Push payload: {title: "...", message: "..."}
```

### Common Issues

#### "Web push not supported in this browser"
- **Cause**: Browser doesn't support Web Push API
- **Fix**: Use Chrome, Firefox, or Edge

#### "Notification permission denied"
- **Cause**: User clicked "Block" on permission prompt
- **Fix**: Clear site settings and reload page

#### "Service worker registration failed"
- **Cause**: Service worker file not found or HTTPS required
- **Fix**:
  - Ensure `public/service-worker.js` exists
  - Serve over HTTPS (or localhost)
  - Check browser console for specific error

#### "Push notification received but not displayed"
- **Cause**: Service worker `push` event not handled correctly
- **Fix**: Check service worker console logs

---

## Production Considerations

### 1. VAPID Key Security

**✅ Proper Setup (Current)**:
- Private key stored as Amplify secret
- Public key in code (safe to expose)
- Managed via `npx ampx sandbox secret set VAPID_PRIVATE_KEY`

**Configuration**:
```typescript
// amplify/backend.ts
const vapidPrivateKey = backend.addSecret('VAPID_PRIVATE_KEY');
backend.pushNotificationSender.addEnvironment('VAPID_PRIVATE_KEY', vapidPrivateKey);
```

**⚠️ Key Rotation Required**:
The initial VAPID keys were accidentally committed to git and must be rotated. See `VAPID_KEYS.md` for detailed rotation instructions.

### 2. Service Worker Caching

The service worker includes cache versioning:
```javascript
const CACHE_VERSION = 'v1';
```

When updating, increment version to force cache refresh.

### 3. Browser Compatibility

| Browser | Desktop | Mobile | Support |
|---------|---------|--------|---------|
| Chrome  | ✅      | ✅     | Full    |
| Firefox | ✅      | ✅     | Full    |
| Safari  | ✅      | ❌     | Desktop only |
| Edge    | ✅      | ✅     | Full    |

**Note**: iOS Safari does not support Web Push API (as of 2025).

### 4. Push Notification Limits

**Expo Push Service** (Mobile):
- Free tier: 1,000,000 notifications/month
- Beyond: $0.002 per notification

**Web Push API** (Web):
- No cost (uses browser's push service)
- No hard limits, but browsers may throttle

### 5. Notification Expiry

Web push subscriptions can expire. The Lambda function handles this by:
- Catching 404/410 errors from Web Push API
- Marking expired tokens as `isActive: false`

---

## Files Modified/Created

### New Files
- `src/utils/webPushUtils.ts` - Web push utility functions
- `public/service-worker.js` - Service worker for push events
- `VAPID_KEYS.md` - VAPID key storage (gitignored)
- `WEB_PUSH_GUIDE.md` - This documentation

### Modified Files
- `src/services/notificationService.ts` - Platform-conditional registration
- `amplify/functions/push-notification-sender/handler.ts` - Dual platform sending
- `amplify/functions/push-notification-sender/package.json` - Added web-push
- `amplify/functions/push-notification-sender/resource.ts` - VAPID env vars
- `app.json` - Web PWA configuration
- `.gitignore` - Ignore VAPID_KEYS.md

### Database Schema
- `amplify/data/resource.ts` - Already supports `platform: 'WEB'`

---

## How It Works: Step-by-Step

### User Opens Web App

1. **User signs in** → `AuthContext` calls `NotificationService.registerPushToken()`
2. **Platform detection** → Detects `Platform.OS === 'web'`
3. **Request permission** → Browser shows notification permission prompt
4. **Register service worker** → `navigator.serviceWorker.register('/service-worker.js')`
5. **Subscribe to push** → `pushManager.subscribe()` with VAPID public key
6. **Store subscription** → Save to DynamoDB with `platform: 'WEB'`

### Notification Sent

1. **Event occurs** (bet resolved, friend request, etc.)
2. **NotificationService.createNotification()** → Creates DB record
3. **Lambda triggered** → `sendPushNotification` mutation called
4. **Token retrieval** → Gets all active tokens for user
5. **Platform separation** → Splits tokens: mobile vs web
6. **Expo Push** → Sends to mobile tokens via Expo API
7. **Web Push** → Sends to web tokens via Web Push API

### User Receives Notification (Web)

1. **Browser receives push** → Service worker `push` event fires
2. **Parse payload** → Extract title, message, data
3. **Display notification** → `showNotification()` with title/body
4. **User clicks** → Service worker `notificationclick` event fires
5. **Deep linking** → Navigate to appropriate screen based on notification type
6. **Focus app** → If already open, focus window; otherwise open new window

---

## Troubleshooting

### Web Push Not Working

1. **Check browser console** for errors
2. **Verify HTTPS** (or localhost)
3. **Check service worker** registration:
   ```javascript
   navigator.serviceWorker.getRegistration().then(reg => console.log(reg));
   ```
4. **Check push subscription**:
   ```javascript
   navigator.serviceWorker.ready.then(reg =>
     reg.pushManager.getSubscription().then(sub => console.log(sub))
   );
   ```
5. **Check Lambda logs** in CloudWatch for web push errors

### Notifications Not Displayed

1. **Check notification permission**:
   ```javascript
   console.log(Notification.permission); // Should be 'granted'
   ```
2. **Check service worker logs**:
   - Open DevTools → Application → Service Workers
   - Click on service worker to see console logs
3. **Verify payload** in service worker `push` event

### Deep Linking Not Working

1. **Check service worker** `notificationclick` handler
2. **Verify notification data** includes `type` or `actionType`
3. **Check URL generation** in `getUrlFromNotificationData()`

---

## Next Steps

### Enhancements

1. **Push subscription renewal**: Periodically refresh web push subscriptions
2. **Notification grouping**: Group related notifications
3. **Rich notifications**: Add images, action buttons
4. **Offline sync**: Queue notifications when offline

### Analytics

Track web push metrics:
- Subscription rate (% of users who enable)
- Click-through rate (% who click notifications)
- Unsubscribe rate

### Testing

Create automated tests for:
- Token registration flow
- Platform detection logic
- Service worker event handling
- Deep linking navigation

---

## Summary

✅ **Web push fully integrated**
- Platform-conditional registration (auto-detects web vs mobile)
- Service worker handles push events and navigation
- VAPID keys configured for security
- Lambda function sends to both Expo and Web Push

✅ **Cross-platform support**
- iOS/Android: Expo Push Service
- Web: Web Push API (Chrome, Firefox, Edge, Safari desktop)

✅ **Production-ready**
- Error handling for expired subscriptions
- Token cleanup for inactive devices
- Secure VAPID key management
- HTTPS requirement enforced

**Ready to test**: Start web dev server, sign in, and receive push notifications in your browser!

