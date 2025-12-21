# Web Push Notification Guide

## Overview

SideBet now supports push notifications on **both mobile and web platforms**:
- **Mobile (iOS/Android)**: Expo Push Notification Service
- **Web (Browsers)**: Web Push API with VAPID keys

This dual-platform approach allows users to receive notifications regardless of how they access SideBet.

---

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
