# Notifications Overhaul — Decisions & Remaining Work

**Status (2026-10-04):** Phases 0–5 are done. Phases 6–8 (web, Android, iOS polish) remain.

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
- **No migration code.** Builds made before this work won't register for push against
  this backend (they write to `PushToken`, which no longer exists). Notifications created
  before TTL have no `expiresAt` and won't expire on their own; clear them before launch
  (checklist below).

---

## 4. Before launch

- [ ] Deploy the backend.
- [ ] Regenerate `amplify_outputs.json` before the next EAS build.
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

### Phase 6: web
- [ ] Service-worker icons served from `public/` (the current paths probably 404 after export).
- [ ] Handle `pushsubscriptionchange` by re-registering.
- [ ] Have the app read the deep-link params on boot, and have the service worker `postMessage` an open tab instead of reloading it.
- [ ] Skip the system notification while a tab is focused (except on Safari, which revokes silent-push subscriptions).
- [ ] Verify the exported manifest supports iOS home-screen web push.
- [ ] A proactive permission ask after onboarding, tied to a tap.

### Phase 7: Android
- [ ] Verify end-to-end on a device with Google Play services.
- [ ] A monochrome (white on transparent) notification icon. The current colour icon renders as a white square.
- [ ] One notification channel per category, with sensible importance levels, created before the Android 13 permission request. Today there are only `default` and `urgent`, both at MAX importance.

### Phase 8: iOS (after the Apple developer account)
- [ ] APNs key through `eas credentials`; confirm the push entitlement.
- [ ] Badge set to the real unread count (Expo messages currently send `badge: 1`).
- [ ] `timeSensitive` interruption level for starting-soon reminders.

### Later
- Server-side notification creation, closing the "anyone can notify anyone" gap.
- Per-device category mutes (the field is already reserved).
- Email as a delivery channel. Nothing in the UI until it exists.

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
