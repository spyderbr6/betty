# Notifications Overhaul Plan

**Status:** approved 2026-09-30. Phase 0 is done; Phase 1 is next.
This is the working plan for rebuilding notification delivery and preferences
across web, Android and (later) iOS. It replaces the "Push notifications are
half-wired" analysis in `todo.md`. Tick items off here as they land.

---

## 1. Decisions

| Question | Decision |
|---|---|
| Preference scope | **Per-account categories, plus an on/off switch per device.** Per-device category mutes are reserved in the model (`PushDevice.mutedCategories`) but not built. On Android, per-category OS channels give device-level control anyway. |
| Can anything be un-mutable? | **No.** The user can mute alerts (push and in-app banner) for every category. |
| Notification feed | **Always written; shown or hidden per category.** Key categories (money, results and payouts, refunds, disputes) **always appear in the feed**. Feed visibility for every other category is a user preference. |
| Where notifications are created | **Stays where it is for now** (client and Lambdas). Push moves to a single server-side dispatcher. Moving *creation* to the server is a later follow-up. |
| Data retention | **Automatic expiry** of notifications, device registrations and old sports events. Financial and audit records are never wiped. |
| Android FCM | **Configured.** `google-services.json` is committed and the FCM V1 service-account key is uploaded to EAS. The docs that said otherwise have been corrected. What's left for Android is device verification, the icon and the channels (Phase 7). |

---

## 2. Problems this fixes

All of these were found in the 2026-09-30 audit. Items marked **(P0)** are fixed in Phase 0.

**Delivery**
- **(P0)** Squares notifications created by the app were silently dropped: the type-to-preference map had no squares entries, and `undefined` read as "disabled".
- **(P0)** A new `PushToken` row was created on every launch, resume, sign-in and hourly token refresh. One device collected dozens of active rows and got one push per row.
- **(P0)** Signing out left the device's token active, so a shared device kept receiving the previous user's pushes.
- **(P0)** Expo requests never sent `EXPO_ACCESS_TOKEN`.
- **(P0)** Foreground notifications on native showed twice (system banner plus toast). Notifications to yourself toasted twice. Toasts also ignored the in-app switch and quiet hours. (Web foreground de-duplication is Phase 6.)
- **(P0)** The web permission prompt fired at sign-in with no user gesture. Safari rejects that and Chrome penalises it.
- **(P0)** The Email toggle did nothing.
- Lambda-created notifications never push: payouts, cancellations, squares, Stripe deposits.
- Whether a push is sent depends on a `priority` hand-picked at each call site, and it's inconsistent (`BET_RESOLVED` is sent as LOW, MEDIUM, HIGH or URGENT depending on where it comes from).
- Do Not Disturb has no way to set hours, and it's evaluated on the *sender's* clock.
- Expo receipts are never checked, and the badge is always 1.

**Security**
- Any signed-in user can push arbitrary text to any user through `sendPushNotification`.
- Any signed-in user can read and update every user's `Notification` rows.
- Any signed-in user can create `PushToken` rows for other users.

**Platform**
- **Web:** the service-worker deep links (`/?bet=`) are never read by the app, icon paths probably 404 after export, `pushsubscriptionchange` isn't handled, and the manifest isn't verified for iOS home-screen push.
- **Android:** the notification icon is a colour PNG (Android renders it as a white square), there are only two channels, both at MAX importance, and the fix has not been re-verified on a device since FCM was set up.

**Data growth**
- Nothing expires. `Notification`, `PushToken`, `LiveEvent` (ESPN events) and `EventCheckIn` grow forever.

---

## 3. Target design

### 3.1 What belongs to the device and what belongs to the person

| Device (`PushDevice`) | Person (`NotificationPreferences`) |
|---|---|
| OS permission, push token or web subscription | Alert mutes per category |
| "Push to this device" on/off | Feed visibility per category (except locked ones) |
| Device name, last seen, remove device | Quiet hours |
| | Timezone (reported by whichever device was last active) |
| | In-app banners on/off |

### 3.2 Notification catalog: the single source of truth

`amplify/shared/notificationCatalog.ts` is imported by both the app and the Lambdas. For every `NotificationType` it records:
- `category`
- `alert`: whether the type ever interrupts (push or banner). "Declined" events are feed-only.
- `androidChannel`
- web urgency and TTL
- iOS interruption level

It's typed `satisfies Record<NotificationType, …>`, so adding a type without cataloguing it is a compile error. A unit test also checks it against the schema enum.

| Category | Types | Always in feed |
|---|---|---|
| `FRIENDS` | FRIEND_REQUEST_RECEIVED / ACCEPTED / DECLINED | |
| `INVITATIONS` | BET_INVITATION_RECEIVED, SQUARES_INVITATION_RECEIVED | |
| `MY_BET_ACTIVITY` | BET_JOINED, BET_INVITATION_ACCEPTED / DECLINED, SQUARES_INVITATION_ACCEPTED / DECLINED | |
| `RESULTS` | BET_RESOLVED, SQUARES_PERIOD_WINNER | ✅ |
| `ACTION_NEEDED` | BET_DISPUTED (plus future "resolve your bet" reminders) | ✅ |
| `REFUNDS` | BET_CANCELLED, SQUARES_GAME_CANCELLED | ✅ |
| `REMINDERS` | BET_DEADLINE_APPROACHING, SQUARES_GAME_LIVE | |
| `SQUARES_UPDATES` | SQUARES_GRID_LOCKED, SQUARES_PURCHASE_CONFIRMED | |
| `MONEY` | DEPOSIT_*, WITHDRAWAL_*, PAYMENT_METHOD_VERIFIED | ✅ |
| `ANNOUNCEMENTS` | SYSTEM_ANNOUNCEMENT | |

"Always in feed" is a catalog property (`feedLocked`), not a user setting. The rule is: anything that moved money or needs the user to act. Alerts for these categories can still be muted.

### 3.3 Preferences model

These are new fields on `NotificationPreferences`. The eight `*Enabled` booleans are read for one release as a migration fallback, then dropped.

```
alertMutedCategories: string[]   // no push, no in-app banner
feedMutedCategories:  string[]   // hidden from the feed; ignored for feedLocked categories
inAppBannersEnabled:  boolean
quietHoursEnabled:    boolean
quietStartMinute:     int        // 0–1439, local to `timezone`
quietEndMinute:       int
timezone:             string     // IANA, e.g. "America/New_York"
```

The lists store what's **muted**, not what's enabled. A new category therefore starts switched on with no schema change or backfill. The old column-per-type layout is how the squares types were missed.

**Quiet hours** suppress push only. The feed still records, and banners only show while the app is open anyway.

### 3.4 Feed visibility is decided when the feed is read

Every notification row is written, and the row carries its `category`. The feed and the unread count filter out categories in `feedMutedCategories`, except locked ones. This means:
- changing a feed preference applies to existing notifications too;
- the write path has no preference logic;
- retention (3.7) deletes the rows either way.

### 3.5 Delivery: one server-side dispatcher

```
Notification INSERT ──DynamoDB stream (INSERT only)──► notification-dispatcher
    ├─ catalog: category, alert?
    ├─ preferences: alert mute, quiet hours in the user's timezone
    ├─ PushDevice rows for the user: active, device switch on
    ├─ Expo (IOS/ANDROID): Authorization header, 100-per-request chunks, category channelId, receipts
    ├─ web-push (WEB): TTL, urgency, tag, deep-link URL
    └─ stamps expiresAt (TTL) on the row with a direct DynamoDB UpdateItem
       (not AppSync, so no onUpdate subscription fires on clients)
```

The client's `createNotification` becomes "write the row". It no longer reads preferences, checks DND, pushes or toasts. The public `sendPushNotification` mutation is removed. A `sendTestPush` mutation replaces it and can only target the caller's own devices.

**In-app banners** come from exactly one place: `NotificationContext`'s `onCreate` subscription. It checks `inAppBannersEnabled` and the alert mutes. The native foreground handler never shows a system banner, and the service worker skips the system notification when a tab is focused (except Safari, which revokes silent-push subscriptions).

### 3.6 Devices

`PushDevice` replaces `PushToken`:

```
id               // `${userId}#${installationId}`: deterministic, so writes are idempotent
userId, installationId, platform (IOS|ANDROID|WEB), transport (EXPO|WEBPUSH)
token, deviceName, appVersion
pushEnabled      // the per-device switch
mutedCategories  // reserved, not built
lastSeenAt, lastSuccessAt, failureCount, isActive
expiresAt        // TTL: lastSeenAt + 120 days
```

Registration goes through a `registerDevice` mutation backed by a Lambda. It upserts, and if another user's row holds the same token (a shared device), it takes the token over. The mutation is called:
- on sign-in;
- when the token changes (`addPushTokenListener` on native, `pushsubscriptionchange` on web);
- at most once a day otherwise.

Sign-out deactivates this device's row.

### 3.7 Retention

| Data | Mechanism | Keep for |
|---|---|---|
| `Notification` | DynamoDB TTL on `expiresAt`, stamped by the dispatcher | 90 days; `MONEY` / `RESULTS` / `REFUNDS` 180 days (per-category `retentionDays` in the catalog) |
| `PushDevice` | DynamoDB TTL, refreshed on every registration | 120 days after last seen |
| `LiveEvent` | Daily `data-retention` Lambda (a Query on `activeEventsByTime` with `isActive = 0`, never a Scan) | 30 days after the event, unless a non-terminal Bet or SquaresGame references it |
| `EventCheckIn` | Deleted with its event by the same Lambda | Same as the event |
| Old `PushToken` table | Dropped after the `PushDevice` cut-over | — |
| Rows written before TTL existed | One-off paginated backfill in `data-retention` (scans are acceptable for a one-off) | — |

DynamoDB TTL deletes are free and happen within about 48 hours of expiry. The dispatcher's stream source filters to `INSERT`, so TTL `REMOVE` events never invoke it.

**Never wiped:** Bet, Participant, Transaction, Dispute, Evidence, SquaresGame / Purchase / Payout, TrustScoreHistory. These are financial and audit records.

**Needs checking before events are deleted:**
- `Bet.eventId` has no index; either add `betsByEvent` or rely on `LiveEvent.betCount`.
- Bet and squares history screens must render when their event is gone.

### 3.8 Security

- `Notification`: read, update and delete by the owner only (`ownerDefinedIn('userId')`, identity claim `sub`). Any signed-in user may create, until creation moves to the server.
- `PushDevice` and `NotificationPreferences`: owner, plus Lambda resource access. Authenticated read on preferences is removed once the dispatcher reads them server-side.
- `sendPushNotification` is removed (Phase 3).

---

## 4. Phases

Each phase ships on its own and leaves the app working.

### Phase 0: stop the bleeding ✅
- [x] Map the squares types in the preference map; unmapped types default to enabled.
- [x] Upsert push tokens by token value and deactivate duplicate rows; register once per session.
- [x] Stable installation ID stored as `deviceId`.
- [x] Sign-out deactivates this device's token rows, not all devices.
- [x] Web: background registration never prompts; the prompt only comes from a user tap in Settings.
- [x] Settings: "This device" status row with an enable button; removed the scan-based auto-register effect and the Email toggle.
- [x] `EXPO_ACCESS_TOKEN` sent as a Bearer header.
- [x] Foreground: no system banner and no duplicate toast; SDK 53+ handler fields.
- [x] Corrected the FCM documentation and the misleading "Firebase not configured" log.
- [x] Playwright: `e2e/notification-settings.spec.ts` (no prompt without a tap, the This Device row, sign-out scope). Vitest: `pushRegistrationLogic`.

**Rollout notes for Phase 0**
- **Expo token:** the sender now sends `EXPO_ACCESS_TOKEN`. If the stored secret is stale, Expo answers 401 and the response body is logged by `push-notification-sender`. Check the logs after the first deploy.
- **Web users:** web users who never granted permission are no longer prompted at sign-in. They enable push from Settings → This Device. The Phase 6 soft ask brings back a proactive prompt, tied to a tap.
- **Duplicate rows:** duplicate `PushToken` rows clean up by themselves. Each device collapses its own duplicates the next time it signs in or launches.

### Phase 1: foundations
- [ ] `amplify/shared/notificationCatalog.ts` plus a completeness test against the schema enum.
- [ ] Add `category` to `Notification`, written by every producer (client and Lambdas) through one `buildNotification` helper.
- [ ] `PushDevice` model plus the `registerDevice` mutation and Lambda; point client registration at it; the sender reads `PushDevice` first and falls back to `PushToken`.
- [ ] Timezone reported by the client at registration.

### Phase 2: preferences model and Settings UI
- [ ] New preference fields (3.3), with a read-time fallback from the old booleans.
- [ ] Rebuild the Settings notifications screen:
  - "This device" card: permission state, enable or unblock steps, device switch, send test.
  - Per-category rows: **Alerts** switch, plus a **Show in feed** switch (shown as always-on, with an explanation, for locked categories).
  - Quiet hours with real time pickers.
  - In-app banners switch.
  - "Your devices" list with remove.
- [ ] Filter the feed and unread count by feed mutes (3.4).
- [ ] Playwright coverage for the screen and the feed filter.

### Phase 3: server-side dispatcher
- [ ] `notification-dispatcher` Lambda on the Notification table stream (INSERT filter). Decision logic lives in a pure module with Vitest coverage: mutes, quiet hours across timezones and DST, per-transport payloads.
- [ ] Expo: chunking, receipts (in the next dispatcher run or a small scheduled check), deactivation on `DeviceNotRegistered`.
- [ ] Web-push: TTL, urgency, deep-link URL in the payload.
- [ ] Stamp `expiresAt` on each notification.
- [ ] Remove push from `createNotification`, remove `sendPushNotification`, add `sendTestPush` (own devices only), and remove stripe-webhook's duplicate preference check.

### Phase 4: retention
- [ ] Enable TTL on `Notification` (`expiresAt`) and `PushDevice` in `backend.ts`.
- [ ] `data-retention` scheduled Lambda (daily): old LiveEvents and their check-ins, subject to the reference check in 3.7.
- [ ] One-off backfill of notifications that predate TTL.
- [ ] Confirm the history screens tolerate a deleted event.

### Phase 5: authorization lockdown
- [ ] Owner-only rules from 3.8. Verify the owner-scoped `onCreate` subscription still delivers, in the real sandbox and not just the mocks.
- [ ] Drop the `PushToken` model once no client writes it.

### Phase 6: web
- [ ] Service-worker icons served from `public/`.
- [ ] `pushsubscriptionchange` handling that re-registers.
- [ ] App reads the deep-link params on boot, and the service worker `postMessage`s an open tab instead of reloading it.
- [ ] Skip the system notification while a tab is focused (except Safari).
- [ ] Verify the exported manifest supports iOS home-screen web push.
- [ ] Soft permission ask after onboarding, tied to a tap.

### Phase 7: Android (FCM already configured)
- [ ] Verify end-to-end on a device with Google Play services using the current build.
- [ ] Monochrome (white on transparent) notification icon.
- [ ] One notification channel per category, with sensible importance levels; created before the Android 13 permission request.

### Phase 8: iOS (after the Apple developer account)
- [ ] APNs key through `eas credentials`; confirm the push entitlement.
- [ ] Badge set to the real unread count.
- [ ] `timeSensitive` interruption level for starting-soon reminders.

### Later
- Move notification creation to the server, so clients can't write rows for other users.
- Per-device category mutes (the field is already reserved).
- Email as a delivery channel. It's not in the UI until it exists.

---

## 5. Verification

- **Vitest:** catalog completeness, delivery decisions, quiet hours, payload builders, registration de-duplication (`src/services/__tests__`).
- **Playwright:** Settings screen, feed filtering, sign-out deactivation.
- **Manual, per platform:** push itself can't be tested end-to-end in CI. After each delivery phase, run the checklist on Chrome (desktop), Android (Play services) and later iOS: register → receive in the background → tap opens the right screen → receive in the foreground (banner only) → sign out → no further pushes.
