# Notifications & Push — How It Works

The current-state reference for notifications: how they're raised, stored, shown and
pushed, plus platform setup, testing and troubleshooting. The decision record and the
work still to do live in [docs/NOTIFICATIONS_PLAN.md](./docs/NOTIFICATIONS_PLAN.md).

---

## 1. The flow

```
 something happens (app or Lambda)
        │
        ▼
 Notification row written  ── with notificationMeta(type): category + expiresAt
        │
        ├──► recipient's app: onCreate subscription ──► unread badge + in-app banner
        │                                                (if their preferences allow)
        │
        └──► DynamoDB stream (INSERT only) ──► push-notification-sender (the dispatcher)
                                                  ├─ reads the recipient's preferences
                                                  ├─ decidePush(): alert type? muted? quiet hours? stale?
                                                  └─ sends to their active PushDevice rows
                                                       ├─ iOS/Android → Expo → APNs/FCM
                                                       └─ Web → Web Push (VAPID)
```

- **Every notification is a row in `Notification`.** The feed is that table, filtered at
  read time by the user's feed preferences.
- **Nothing calls push directly.** The dispatcher is the only sender, for notifications
  from the app and from every Lambda alike.
- **Rows delete themselves.** DynamoDB TTL on `expiresAt` removes notifications after
  90 days (180 for money, results and refunds) and devices 120 days after they were last seen.

## 2. Key files

| Concern | File |
|---|---|
| Every notification type, its category, retention, whether it alerts | `amplify/shared/notificationCatalog.ts` |
| What preferences mean: `shouldAlert`, `isFeedVisible`, quiet hours | `amplify/shared/notificationPreferencesLogic.ts` |
| Dispatcher (stream handler, `sendTestPush`) | `amplify/functions/push-notification-sender/handler.ts` |
| Dispatcher decisions (pure, tested) | `.../push-notification-sender/dispatchLogic.ts`, `pushLogic.ts` |
| Device registration Lambda (`registerDevice`, `unregisterDevice`, `setDevicePush`) | `amplify/functions/device-registry/` |
| Stream wiring, TTL | `amplify/backend.ts` |
| App: create notifications, register this device, read the feed | `src/services/notificationService.ts` |
| App: load/save preferences | `src/services/notificationPreferencesService.ts` |
| App: unread count + in-app banners | `src/contexts/NotificationContext.tsx` |
| App: Settings UI | `src/components/settings/NotificationPreferencesPanel.tsx` |
| App: tap handling, Android channels, foreground behaviour | `src/services/pushNotificationConfig.ts`, `src/utils/notificationNavigationHandler.ts` |
| Web: subscription, service worker | `src/utils/webPushUtils.ts`, `public/service-worker.js` |

## 3. Raising a notification

Write the row; include `notificationMeta(type)`. That's all — the dispatcher decides
about push.

```typescript
import { notificationMeta } from '../../shared/notificationCatalog'; // path varies

await client.models.Notification.create({
  userId: recipientId,
  type: 'BET_RESOLVED',
  ...notificationMeta('BET_RESOLVED'),   // category + expiresAt
  title: 'You Won!',
  message: 'You won $50 on "Lakers vs Celtics"',
  isRead: false,
  priority: 'HIGH',                      // HIGH/URGENT = urgent delivery; does not decide *whether* to push
  actionType: 'view_bet',
  actionData: JSON.stringify({ betId }),
  relatedBetId: betId,
});
```

In the app, `NotificationService.createNotification({...})` does this for you.

**Adding a notification type:** add it to `NOTIFICATION_TYPES` and `NOTIFICATION_CATALOG`
in the catalog (category, and whether it alerts). The schema enum and the app's
`NotificationType` are built from it, and the compiler flags every map that needs an
entry (`toastNotificationService`, `notificationNavigationHandler`).

## 4. Devices

- **One `PushDevice` row per installation** (browser profile on web), id
  `<userId>#<installationId>`. The installation id is generated once and kept in
  AsyncStorage (`src/services/installationId.ts`).
- **Registration** (`NotificationService.registerPushToken`) runs at sign-in and
  then at most once per session. It calls `registerDevice`, which upserts the row and
  records a device name and timezone. If another user's row holds the same token
  (a shared device), it deactivates that row. The timezone is also copied onto the
  user's preferences for quiet hours.
- **Permission prompts:**
  - **Web:** never prompted automatically, because browsers ignore or penalise
    prompts without a tap. Users enable push from Settings → This Device → Enable.
  - **Mobile:** the OS prompt is shown at sign-in.
- **Sign-out** calls `unregisterDevice` for this installation only. The row is kept,
  with its push switch, so signing back in restores it.
- **Users can read and delete their own device rows but not update them.** With
  update, a user could rewrite `userId` and receive someone else's pushes. The device
  switch goes through `setDevicePush`, which checks ownership.

## 5. Preferences

Per account, in `NotificationPreferences`:

| Field | Meaning |
|---|---|
| `pushEnabled` | Account-wide push switch |
| `inAppEnabled` | In-app banners while the app is open |
| `alertMutedCategories` | Categories that never push or banner. Any category can be muted. |
| `feedMutedCategories` | Categories hidden from the feed and unread count. Ignored for feed-locked categories: money, results, refunds, disputes. |
| `quietHoursEnabled`, `quietStartMinute`, `quietEndMinute`, `timezone` | Push is held during quiet hours, read in the user's own timezone. Banners and the feed are unaffected. |

Each device additionally has its own `pushEnabled` switch. "Declined"-type
notifications are feed-only and never alert, whatever the preferences say. In-app
banners also skip `LOW`-priority notifications (a rule in `toastNotificationService`),
so a LOW notification that alerts will push but won't banner.

## 6. Who can do what

| Data | Rule |
|---|---|
| `Notification` | The recipient reads, updates (marks read) and deletes. Any signed-in user may create one for anyone; the creator is recorded in `owner` and can read back only what they wrote. |
| `NotificationPreferences` | Owner only. `userId` can't be changed after create. |
| `PushDevice` | Owner reads and deletes; every write goes through `device-registry`. |
| `sendTestPush` | Pushes only to the caller's own devices. |
| Lambdas | Access through IAM (`allow.resource`), outside these rules. |

**Known gap:** any user can still create a notification with any text for any user,
and it will push if the recipient's preferences allow. Closing that means moving
notification creation server-side; it's listed under "Later" in the plan.

## 7. Platform setup

### Android (FCM) — configured

Expo routes Android pushes through FCM with your own credentials.

| File | Contents | Handling |
| --- | --- | --- |
| `google-services.json` | Public identifiers | Committed at the repo root, referenced by `app.json` |
| Service account JSON | **Private key** | Never commit — upload to EAS only |

Both are in place. If the key is rotated or the Firebase project recreated:

1. Firebase Console → Project Settings → Service Accounts → Generate new private key.
2. `eas credentials` → Android → production → Google Service Account → FCM V1 → upload.
   (Or EAS dashboard → Credentials → Android → FCM V1.)
3. Rebuild — credentials are baked in at build time.

`android/` is committed, so EAS doesn't run prebuild. If `google-services.json` changes,
run `npx expo prebuild --platform android --clean` so it lands in `android/`, then
recreate the gitignored `android/local.properties` with your `sdk.dir`.

Registration needs Google Play services: a physical device, or an emulator image *with*
Google Play. A plain AOSP image fails with `E_REGISTRATION_FAILED`.

### iOS (APNs) — when the Apple developer account exists

1. Apple Developer Portal: App ID `com.sidebet.app` with the Push Notifications capability; create an APNs key.
2. `eas credentials` → iOS → Push Notifications → upload the APNs key.
3. `eas build -p ios --profile production` (ask before running EAS builds).

### Web (VAPID)

- **Public key:** hardcoded in `src/utils/webPushUtils.ts` and mirrored as `WEB_PUSH_PUBLIC_KEY`
  in `amplify/functions/push-notification-sender/resource.ts`.
- **Private key:** the Amplify secret `VAPID_PRIVATE_KEY`
  (`npx ampx sandbox secret set VAPID_PRIVATE_KEY`, or `npx ampx secret set VAPID_PRIVATE_KEY --branch <branch>`).

Both halves must be from the same keypair. A mismatch shows up as a 403 from the
browser's push service, not a crash.

> An earlier version of this guide said the original private key had been committed and
> needed rotating. Whether that happened isn't recorded. While you're pre-launch it's
> cheap to be sure:
> 1. `npx web-push generate-vapid-keys`
> 2. Update both halves.
> 3. Clear site data in any browser that already subscribed. The app reuses an existing
>    subscription, and one made with the old key won't receive pushes.

### Expo access token

`EXPO_ACCESS_TOKEN` is an Amplify secret the dispatcher sends as a Bearer token. It's
required if "Enhanced Security for Push Notifications" is on in the Expo project. A
wrong or revoked token shows up as a logged 401 from Expo.

## 8. Testing

**Automated** (none of it reaches a real device):
- **Vitest:**
  - catalog completeness
  - preference rules (timezones, DST)
  - `dispatchLogic` and `pushLogic`
  - `deviceLogic`
  - device naming
  - settings formatting
- **Playwright:**
  - `e2e/notification-settings.spec.ts`: prompt timing, web registration, sign-out, Send test.
  - `e2e/notification-preferences.spec.ts`: categories, locked feed, quiet hours, device list, feed filtering.

**On a device:**
1. Install a build made after the backend deploy (`amplify_outputs.json` regenerated first).
2. Sign in and allow notifications. Settings → Your Devices should list the device.
3. Settings → This Device → **Send Test Notification**.
4. Raise a real notification from another account (friend request, bet join), with the
   app in the background. Tapping the push should open the right screen.
5. Repeat with the app in the foreground: you get an in-app banner, and no system banner.
6. Sign out. Further notifications to that user should not reach this device.

**Reading the dispatcher's logs** (CloudWatch, `push-notification-sender`): one line per
notification, either `pushed to N device(s)` or `not pushed: <reason>`:
- `feed-only`: the type never alerts.
- `preferences`: muted, push off, or quiet hours.
- `stale`: more than an hour old by the time it was processed.

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Nothing pushes for anyone | Dispatcher logs. No invocations means the stream mapping or deploy. 401 means `EXPO_ACCESS_TOKEN`. 403 on web means the VAPID keypair mismatch. |
| Test says "Sent to 1 device" but nothing arrives on Android/iOS | Tickets only mean Expo accepted the message. Look up the receipt by hand: `POST https://exp.host/--/api/v2/push/getReceipts` with `{"ids": ["<ticket id from the dispatcher log>"]}`. `InvalidCredentials` or `MismatchSenderId` means the FCM/APNs credential is wrong. (Automatic receipt checks were deliberately deferred.) |
| One user gets nothing | Settings → Your Devices: is the device listed, active, and its switch on? Then their categories, push switch and quiet hours. The dispatcher log gives the reason. |
| Device missing from Your Devices | Notification permission wasn't granted, or registration failed. On Android check for `E_REGISTRATION_FAILED` (no Play services). On web it needs Settings → Enable. |
| Push arrives but the tap goes nowhere (native) | `[Push] Navigation callback registered` should appear in the logs. Check the notification's `type`/`actionType`. |
| Push arrives but the tap goes nowhere (web) | Known: the app doesn't read the service worker's deep-link URL yet (plan Phase 6). |
| Unread badge doesn't match the feed | Both count only feed-visible categories. A category hidden from the feed doesn't count. |

## 10. Not built yet

Tracked in [docs/NOTIFICATIONS_PLAN.md](./docs/NOTIFICATIONS_PLAN.md):
- **Web (Phase 6):**
  - Deep-link handling in the app.
  - Service-worker icons served from `public/`.
  - `pushsubscriptionchange`.
  - Skipping the system notification while a tab is focused.
  - iOS home-screen web push.
  - A proactive (tap-gated) permission ask.
- **Android (Phase 7):**
  - A monochrome notification icon.
  - One notification channel per category. Today there are two, `default` and `urgent`.
  - On-device verification.
- **iOS (Phase 8):**
  - APNs setup.
  - Badge count.
  - Time-sensitive interruption level.
- **Deferred by decision:** automatic Expo receipt checks.
- **Later:** server-side notification creation; per-device category mutes; email.
