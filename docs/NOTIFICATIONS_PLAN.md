# Notifications Overhaul — Decisions & Remaining Work

**Status:** Phases 0–8 are done in code. What's left needs a real device (Android now, iOS once the Apple developer account exists) or is deferred; see §5.

- **How the system works now:** [PUSH_NOTIFICATION_GUIDE.md](../PUSH_NOTIFICATION_GUIDE.md).
- **This document:** why it's built that way, what was deliberately left out (so nobody
  "fixes" it), the pre-launch checklist, and what's left.

---

## 1. Decisions

| Question | Decision |
|---|---|
| Preference scope | **Per-account categories, plus an on/off switch per device.** Per-device category mutes are reserved (`PushDevice.mutedCategories`) but not built. |
| Can anything be un-mutable? | **No.** Every category's alerts (push and in-app banner) can be muted. |
| Notification feed | **Every notification is written; categories are shown or hidden at read time.** Money, results and payouts, refunds and disputes **always** show in the feed. |
| What decides a push | **The recipient's preferences plus the catalog's per-type `alert` flag**, applied by one server-side dispatcher. `priority` only sets delivery urgency. |
| Where notifications are created | **Where the event happens:** the acting user's app, or a Lambda. Moving creation server-side is a later follow-up (see §3). |
| Data retention | **DynamoDB TTL.** Notifications last 90 days, or 180 for money, results and refunds. Devices expire 120 days after they were last seen. Financial and audit records are never wiped. |
| Sports events (`LiveEvent`) | **Out of scope** here; their cleanup is tracked in `todo.md`. |
| Backward compatibility | **None. The app isn't live.** The old `PushToken` table, the legacy per-type preference switches and the one-off expiry backfill were removed in Phase 5, not migrated. |
| Expo delivery receipts | **Deferred.** Inactive users stop generating notifications, and the existing cleanup covers dead devices. See §3. |
| Android FCM | **Configured** (`google-services.json` committed, FCM V1 key on EAS). |
| Android channels | **One per category**, named after it, so the system's own notification settings match the app's. Importance comes from the catalog (`androidImportance`). |
| iOS badge | **Unread, feed-visible notifications**, the same count as the app's bell. |
| Web permission | **Asked only from a tap:** a card in the feed, or Settings. Never on load. |

---

## 2. What was done

| Phase | Outcome |
|---|---|
| 0 | Stopped duplicate token rows (one per launch, so one push per row); sign-out deactivates only this device; web never prompts without a tap; no double banners in the foreground; `EXPO_ACCESS_TOKEN` sent; squares notifications no longer silently dropped. |
| 1 | `notificationCatalog.ts`: one list of types and categories that the schema and the app both build from. Every write carries `category` + `expiresAt`, and TTL is on. Added `PushDevice` + the `device-registry` Lambda. |
| 2 | Category preferences (alerts and feed), quiet hours in the user's timezone, per-device switch, rebuilt Settings, feed and unread count filtered at read time. |
| 3 | The dispatcher: a DynamoDB stream on `Notification` invokes `push-notification-sender` for every insert, so Lambda-raised notifications push. Removed the `sendPushNotification` mutation, which let anyone push any text to anyone. Added `sendTestPush` and a Send-test button. |
| 4 | Built a one-off expiry backfill for pre-TTL notifications. **Removed in Phase 5**: the app isn't live, so there's nothing to migrate. Recoverable from commit `08840b3` if ever needed. |
| 5 | Owner-only access. Notifications are readable only by the recipient (the creator can read back just what they wrote). Preferences are owner-only, and their `userId` can't be changed. Compatibility layers removed (see Decisions). |
| 6 | Web: icons served from `public/`; a manifest and page template for iOS home-screen push; clicks routed into the app (message to an open tab, or `?notification=` on a new one); renewed subscriptions re-registered; no system notification while a tab is focused (except Safari and the test push); a tap-gated soft ask in the feed. |
| 7 | Android: white-on-transparent notification icon in the brand colour; one channel per category (the old `urgent` channel is deleted); taps that launch the app are held until sign-in finishes instead of dropped. |
| 8 | iOS: the dispatcher sends the real unread count as the badge and the app keeps it current; `SQUARES_GAME_LIVE` and `BET_DEADLINE_APPROACHING` are time-sensitive, with the entitlement declared in `app.json`. |

**Bugs found along the way.** All fixed; don't re-investigate.
- The squares types were missing from the type-to-preference map, and a missing entry read as "disabled".
- Registration created a new `PushToken` row on every launch and hourly refresh.
- Do Not Disturb was evaluated on the *sender's* clock, and its hours could never be set.
- The Email toggle did nothing.
- Every signed-in user could read and edit every user's notifications.
- `PushDevice` as first written would have let a user reassign `userId` and receive someone else's pushes. Caught by the CDK synth warning; users now can't update device rows at all.
- The app's `onUpdate` listener counts any update to an unread notification as a new unread one. This is why bulk fixes to notifications must go straight to DynamoDB, not through AppSync.

---

## 3. Deliberately not done

These are known and intentional. Don't "fix" them without revisiting the reason.

- **Expo receipts aren't checked.** Tickets catch most dead devices, TTL removes the
  rest, and inactive users stop generating notifications anyway. The blind spot: a broken
  FCM/APNs credential only shows in receipts. If push goes quiet on mobile, check a
  receipt by hand (see the guide's troubleshooting).
- **A recipient can reassign a notification's `userId`/`owner`** (synth warns about it). It
  grants nothing new, since anyone may already create a notification for anyone. Closing it
  needs field-level rules on `Notification`, which can blank fields on the subscription the
  app's live listener uses.
- **Any user can create a notification, with any text, for any user.** It needs the
  acting user's app to notify others (friend requests, invitations, joins). The creator is
  recorded in `owner`. The real fix is server-side creation (Later).
- **`sendPush` / priority-based push are gone on purpose.** Whether to push is the
  dispatcher's call, from preferences and the catalog. Feed-only types (the "declined"
  ones) never push.
- **A focused web tab gets no system notification**, only the in-app banner, matching
  native foreground behaviour. Safari is the exception: it cancels a subscription that
  receives a push without showing a notification.
- **The iOS badge counts only the newest 100 notifications.** Past that the exact number
  doesn't matter, and the count is a query on every push to an iOS device.
- **"Not Now" on the feed's push card is permanent for that device.** Settings still
  offers Enable; nagging again is how sites get their prompts blocked.
- **Notification icon drawables aren't committed.** `android/app/src/main/res/drawable-*/`
  is gitignored and generated by prebuild from `app.json`. Committing them would clash
  with the copies already in local checkouts.
- **No push step in onboarding.** Mobile prompts at sign-in already, and web has the
  feed card. Revisit if web sign-ups rarely enable push.
- **No migration code.** Builds made before this work won't register for push against
  this backend (they write to `PushToken`, which no longer exists). Notifications created
  before TTL have no `expiresAt` and won't expire on their own; clear them before launch
  (checklist below).

---

## 4. Before launch

- [ ] Deploy the backend.
- [ ] Regenerate `amplify_outputs.json` before the next EAS build.
- [ ] Run `npx expo prebuild --platform android` before the next Android build, so the
      new notification icon reaches the gitignored drawables.
- [ ] Clear old test notifications that have no `expiresAt`: empty the Notification table,
      or restore the backfill from `08840b3`.
- [ ] Confirm in the real backend what mocks can't cover:
  - The recipient's `onCreate` subscription still delivers under the owner rules.
  - Creating a notification for another user returns without an authorization error.
  - Settings → Send Test Notification arrives on a real Android device and in a browser.
- [ ] Check the VAPID keypair. If the originally committed private key was never
      rotated, rotate it (steps in the guide).

---

## 5. Remaining work

### Needs a device
- [ ] **Android**, on a device with Google Play services:
  - Send Test Notification arrives.
  - The status-bar icon is the white "SB".
  - System settings list one channel per category, and no "Urgent".
  - A tap with the app closed opens the right screen after sign-in.
- [ ] **iOS**, after the Apple developer account:
  - APNs key through `eas credentials`.
  - Time Sensitive Notifications capability on the App ID (the entitlement is already in `app.json`).
  - Badge shows the unread count and clears as notifications are read.
  - Starting-soon reminders break through a Focus mode.
- [ ] **Web**, in a real browser (Playwright plays the service worker's part but can't push):
  - Pushes show the SideBet icon, and Android Chrome shows the monochrome badge.
  - Clicking one with the tab closed opens the right screen.
  - On an iPhone, push works from the home-screen app.

### Later
- Server-side notification creation, closing the "anyone can notify anyone" gap.
- Per-device category mutes (the field is already reserved).
- Email as a delivery channel. Nothing in the UI until it exists.
- A push step in onboarding, if web users rarely find the feed card (see §3).

---

## 6. Verification approach

- **Vitest:** the logic is pure modules; handlers that can't be imported stay thin.
- **Playwright:** screens and data-layer calls against mocked AppSync. A new test is
  only trusted once it has been seen to fail with its behaviour broken.
- **CDK synth (`npx cdk synth`):** catches schema and auth-rule rejections, dependency
  cycles and bundling problems without deploying. It's how the `PushDevice`
  reassignment issue was found.
- **What none of these reach:** real AWS authorization at runtime, real push providers and
  real devices. That's the before-launch checklist.
