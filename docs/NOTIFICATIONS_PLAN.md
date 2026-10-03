# Notifications Overhaul Plan

**Status:** approved 2026-09-30. Phases 0–3 are done; Phase 4 (retention backfill) is next.
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
| Data retention | **Automatic expiry** of notifications (the event log behind the feed) and device registrations. Financial and audit records are never wiped. Old sports events (`LiveEvent`) are out of scope here and tracked in `todo.md`. |
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
- **(P3)** Lambda-created notifications never pushed: payouts, cancellations, squares, Stripe deposits. They now push through the dispatcher.
- Whether a push is sent depends on a `priority` hand-picked at each call site, and it's inconsistent (`BET_RESOLVED` is sent as LOW, MEDIUM, HIGH or URGENT depending on where it comes from).
- Do Not Disturb has no way to set hours, and it's evaluated on the *sender's* clock.
- Expo receipts are never checked, and the badge is always 1.

**Security**
- **(P3)** Any signed-in user could push arbitrary text to any user through `sendPushNotification`. Removed; push now comes only from the dispatcher.
- Any signed-in user can read and update every user's `Notification` rows.
- Any signed-in user can create `PushToken` rows for other users.

**Platform**
- **Web:** the service-worker deep links (`/?bet=`) are never read by the app, icon paths probably 404 after export, `pushsubscriptionchange` isn't handled, and the manifest isn't verified for iOS home-screen push.
- **Android:** the notification icon is a colour PNG (Android renders it as a white square), there are only two channels, both at MAX importance, and the fix has not been re-verified on a device since FCM was set up.

**Data growth**
- **(P1)** Nothing expired. `Notification` and device registrations now carry `expiresAt` and are deleted by DynamoDB TTL. (`LiveEvent` / `EventCheckIn` growth is tracked separately in `todo.md`.)

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

New fields on `NotificationPreferences`, alongside existing ones that kept their meaning:

```
alertMutedCategories: string[]   // new — no push, no in-app banner
feedMutedCategories:  string[]   // new — hidden from the feed; ignored for feedLocked categories
quietStartMinute:     int        // new — 0–1439, local to `timezone`
quietEndMinute:       int        // new
timezone:             string     // new — IANA, e.g. "America/New_York"; written by device-registry
pushEnabled:          boolean    // existing — account-wide push switch
inAppEnabled:         boolean    // existing — the in-app banners switch
dndEnabled:           boolean    // existing — the quiet hours switch
```

A row is in the new format once `alertMutedCategories` has been written (even empty). Until then, `resolvePreferences()` derives mutes from the eight legacy `*Enabled` switches (off → alert *and* feed mute, since off used to mean "don't create it at all") and quiet hours from `dndStartHour`/`dndEndHour`. Every save writes both lists, so a row migrates the first time its owner changes anything; new rows are created in the new format. The legacy columns can be dropped once rows have migrated. All of this lives in `amplify/shared/notificationPreferencesLogic.ts`, shared with the Phase 3 dispatcher.

The lists store what's **muted**, not what's enabled. A new category therefore starts switched on with no schema change or backfill. The old column-per-type layout is how the squares types were missed.

**Quiet hours** suppress push only. The feed still records, and banners only show while the app is open anyway.

### 3.4 Feed visibility is decided when the feed is read

Every notification row is written, and the row carries its `category`. The feed and the unread count filter out categories in `feedMutedCategories`, except locked ones. This means:
- changing a feed preference applies to existing notifications too;
- the write path has no preference logic;
- retention (3.7) deletes the rows either way.

### 3.5 Delivery: one server-side dispatcher

```
Notification INSERT ──DynamoDB stream (INSERT only)──► push-notification-sender (the dispatcher)
    ├─ catalog: category, alert?
    ├─ preferences: alert mute, quiet hours in the user's timezone
    ├─ PushDevice rows for the user: active, device switch on
    ├─ Expo (IOS/ANDROID): Authorization header, 100-per-request chunks, category channelId, receipts
    └─ web-push (WEB): TTL, urgency, tag, deep-link URL
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

Registration goes through a `registerDevice` mutation backed by the `device-registry` Lambda. It upserts, and if another user's row holds the same token (a shared device), it takes the token over. The mutation is called:
- on sign-in;
- when the token changes (`addPushTokenListener` on native, `pushsubscriptionchange` on web);
- at most once a day otherwise.

Sign-out calls `unregisterDevice`, which deactivates this device's row but keeps it, so the device switch survives signing back in.

Users can read and delete their own `PushDevice` rows but never update them directly. With update, an owner could rewrite `userId` to someone else's id and receive their pushes; the CDK synth flags exactly this ("owners may reassign ownership"). Every write therefore goes through `device-registry`, including the Phase 2 device switch.

### 3.7 Retention

| Data | Mechanism | Keep for |
|---|---|---|
| `Notification` | DynamoDB TTL on `expiresAt`, set at write time by `notificationMeta()` from the catalog, by every producer (app and Lambdas) | 90 days; `MONEY` / `RESULTS` / `REFUNDS` 180 days (per-category `retentionDays` in the catalog) |
| `PushDevice` | DynamoDB TTL, pushed forward on every registration | 120 days after last seen |
| Old `PushToken` table | Dropped after the `PushDevice` cut-over | — |
| Notifications written before TTL existed | One-off backfill: set `expiresAt` from `createdAt` + retention, so TTL removes the old ones | — |

DynamoDB TTL deletes are free and happen within about 48 hours of expiry. TTL is enabled on both tables in `backend.ts`. The dispatcher's stream source will filter to `INSERT`, so TTL `REMOVE` events never invoke it.

**Never wiped:** Bet, Participant, Transaction, Dispute, Evidence, SquaresGame / Purchase / Payout, TrustScoreHistory. These are financial and audit records.

### 3.8 Security

- `Notification`: read, update and delete by the owner only (`ownerDefinedIn('userId')`, identity claim `sub`). Any signed-in user may create, until creation moves to the server.
- `PushDevice` and `NotificationPreferences`: owner, plus Lambda resource access. Authenticated read on preferences is removed once the dispatcher reads them server-side.
- `sendPushNotification` is removed (done in Phase 3).

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

### Phase 1: foundations ✅
- [x] `amplify/shared/notificationCatalog.ts`. The schema's `Notification.type` enum and the app's `NotificationType` are both built from it, so they can't drift. Completeness tests are in `amplify/shared/__tests__`.
- [x] `category` and `expiresAt` on `Notification`, written by every producer (the app's `createNotification`, two direct app call sites, and the payout, bet-checker, squares-checker and Stripe Lambdas) through `notificationMeta()`.
- [x] DynamoDB TTL enabled on `Notification` and `PushDevice` (moved up from Phase 4).
- [x] `PushDevice` model plus `registerDevice` / `unregisterDevice` mutations on the `device-registry` Lambda. The app registers through it and retires its legacy `PushToken` rows. The sender reads `PushDevice` and falls back to `PushToken`, sending each token once (`resolvePushTargets`).
- [x] Device name and timezone reported at registration.
- [x] Playwright: web registration through `registerDevice`, and sign-out through `unregisterDevice`. Vitest: catalog, `deviceLogic`, `resolvePushTargets`, user-agent naming.

**Rollout notes for Phase 1**
- **Config on mobile builds:** `amplify_outputs.json` must be regenerated before the next EAS build so the app knows `registerDevice`. A build with a stale config falls back to the Phase 0 `PushToken` path, and still gets push.
- **Old app versions:** installs that predate this keep writing `PushToken`. The sender still reads it, so they keep getting push.
- **Timezone storage:** the timezone is on `PushDevice` for now. Phase 2 copies the most recent one onto preferences for quiet hours.

### Phase 2: preferences model and Settings UI ✅
- [x] New preference fields (3.3), with a read-time fallback from the old booleans (`resolvePreferences`). `device-registry` copies the reporting device's timezone onto preferences.
- [x] `setDevicePush` on `device-registry` for the device switch, with an ownership check.
- [x] Settings rebuilt around `src/components/settings/NotificationPreferencesPanel.tsx`:
  - **This device:** permission state, enable or unblock steps, and the device's own push switch. "Send test" was added in Phase 3.
  - **Alerts:** account-wide push, and in-app banners.
  - **Categories:** per-category **Alerts** and **Feed** switches. Locked categories show "Always" instead of a feed switch.
  - **Quiet hours:** 30-minute steppers (no native time picker dependency), shown with the timezone they're read in.
  - **Your devices:** name, last active, push switch, remove.
- [x] Feed and unread count filtered by feed mutes (`isFeedVisible`), in both `getUserNotifications` and the live count in `NotificationContext`.
- [x] Every notification is written, and preferences only gate interruptions. The app's push decision now uses `shouldAlert` (category mutes, quiet hours in the recipient's timezone, the catalog's `alert`) instead of the HIGH/URGENT priority rule. stripe-webhook no longer skips money notifications.
- [x] Playwright (`e2e/notification-preferences.spec.ts`): categories, locked feed, legacy carry-over, quiet hours, devices, feed filtering and unread count. Vitest: `notificationPreferencesLogic` including timezones and DST, settings formatting, `deviceLogic`.

**Rollout notes for Phase 2**
- **More pushes:** push is now decided per category, not by priority. MEDIUM notifications (friend requests, bet joins, reminders) push unless muted.
- **Legacy switches:** someone who had turned off a legacy switch now has that category muted for alerts and hidden from the feed. Money, results, refunds and disputes are the exception: they now show in the feed regardless, which is intended.
- **Banners and quiet hours:** in-app banners now ignore quiet hours. They only appear while the user has the app open.

### Phase 3: server-side dispatcher ✅
- [x] `push-notification-sender` became the dispatcher, rather than a new Lambda, so it keeps its VAPID and Expo secrets and its tested send code.
  - **Stream wiring:** an event source mapping on the Notification table's stream (`backend.ts`), filtered to INSERT, batches of 25, per-record failure reporting, 3 retries, and records older than an hour dropped. The mapping and its read policy live in the table's stack to avoid a circular dependency with the resolver.
  - **Decisions:** in `dispatchLogic.ts`. `decidePush` uses the same `shouldAlert` as the app's banners, plus a one-hour staleness guard so a backlog after an outage doesn't push stale alerts. Stream images are read with a small built-in `unmarshall`.
- [x] Expo: sends batched at 100 per request; `DeviceNotRegistered` tickets deactivate the device.
- [x] Web-push: TTL (24h) and urgency (high for HIGH/URGENT). The deep-link URL is Phase 6, with the service-worker work.
- [x] `createNotification` only writes the row now, and the `sendPush` flag is gone. Its three `false` callers were all feed-only types, which the catalog never pushes anyway.
- [x] `sendPushNotification` removed. `sendTestPush` (no arguments; caller's own devices) replaces it, with a "Send Test Notification" row in Settings.
- [x] Playwright: the Send-test button (sent, nothing delivered, hidden until permission is granted). Vitest: `dispatchLogic`.
- [ ] **Deferred by decision (2026-10-03): Expo receipts.** Not worth a stored ticket per device and a scheduled job. Users who stop using the app stop generating notifications, so dead tokens are rarely sent to, and the cleanup routines already cover them (120-day device TTL, deactivation on `DeviceNotRegistered` tickets and web-push 404/410). The one blind spot: a broken FCM/APNs credential only shows up in receipts, so tickets (and the Settings test count) can say "sent" while nothing arrives. If push ever goes quiet, check the receipt for a test send by hand (`POST https://exp.host/--/api/v2/push/getReceipts` with the ticket id from the dispatcher's log) before anything else. Revisit if send volume grows enough for wasted sends to cost money.

**Rollout notes for Phase 3**
- **Backend pushes start working on deploy:** payout, cancellation, squares and deposit notifications will begin pushing for the first time.
- **Old app builds:** mobile builds made before this still call `sendPushNotification` after creating a notification, and that call now fails. The failure is caught and the notification is still written, so it still pushes, once, through the dispatcher. No double sends.
- **Checking it works:** the dispatcher logs one line per notification: `pushed to N device(s)`, or `not pushed: <reason>`.

### Phase 4: retention backfill
- [x] ~~Enable TTL~~ (done in Phase 1).
- [ ] One-off backfill: give notifications that predate TTL an `expiresAt` from `createdAt` + retention.

### Phase 5: authorization lockdown
- [ ] Owner-only rules from 3.8. Verify the owner-scoped `onCreate` subscription still delivers, in the real sandbox and not just the mocks.
- [ ] Drop the `PushToken` model once no client writes it. Old app versions write it until they update, so check its newest `lastUsed` before dropping.

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
