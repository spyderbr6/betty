# Authentication Cleanup & Biometrics Plan

Status: **proposal — not implemented.** Written 2026-08-28.

Goal: replace the half-built TOTP 2FA with an authentication experience that uses
device biometrics, drops the authenticator-app requirement, and closes the gaps in
the current sign-in flow.

---

## 1. What is actually true today

### 1.1 Passkeys do not work in Expo / React Native via Amplify

This is the headline constraint and it shapes everything below.

The Amplify Gen 2 docs carry an explicit React Native callout on the WebAuthn page:

> "WebAuthn registration and authentication are not currently supported on React
> Native, other passwordless features are fully supported."

`associateWebAuthnCredential`, `listWebAuthnCredentials`, `deleteWebAuthnCredential`
and the `WEB_AUTHN` first-factor challenge all exist in `aws-amplify@6.15.x` (which
this repo pins), but they are browser-only — they call `navigator.credentials`, which
does not exist in the RN runtime. There is no `@aws-amplify/react-native` passkey
native module.

So "biometric passkey" has to be split into two separate things, because users mean
one thing by it and the spec means another:

| What users mean | What it actually is | Available to us now? |
| --- | --- | --- |
| "Face ID to get into the app" | Device-local biometric unlock of a stored session | **Yes** — `expo-local-authentication` |
| "Passkey" | A WebAuthn credential that replaces the password at the Cognito level | **No** — not on RN |

The first one is what nearly every banking and fintech app actually ships, and it is
what this plan builds. The second is tracked in §5 as a future upgrade.

### 1.2 The existing TOTP 2FA is almost certainly dead on arrival

`amplify/auth/resource.ts` has no `multifactor` block:

```ts
export const auth = defineAuth({
  loginWith: { email: true },
  userAttributes: { preferredUsername: { required: true } },
  groups: ['bettors', 'moderators'],
});
```

`defineAuth` without `multifactor` leaves the user pool's MFA configuration at OFF.
`TrustSafetyScreen.tsx` calls `setUpTOTP()` → `verifyTOTPSetup()` →
`updateMFAPreference({ totp: 'PREFERRED' })`. With pool MFA off, Cognito rejects that
path with `SoftwareTokenMFANotFoundException` ("Software Token MFA has not been enabled
by the userPool"). The "Enable 2FA" button in Trust & Safety therefore fails for every
user who taps it.

**Verify before deleting:** confirm in the Cognito console that MFA really is OFF on
the deployed pool and that no user has an active TOTP factor. If any user has one,
they must be migrated off it before the pool config changes, or they will be locked out.

### 1.3 There is no forgot-password flow

`src/types/auth.ts` declares `forgotPassword` / `resetPassword`, and
`src/types/navigation.ts` declares a `ForgotPassword` route — but no screen exists and
`Login.tsx` has no "Forgot password?" link. A user who forgets their password today is
permanently locked out.

This matters more than usual here: every biometric scheme is a *convenience layer over
a session*. When the session is gone (new device, reinstall, expired refresh token),
the user falls back to the password. Without recovery, biometrics make that cliff worse,
not better, because people stop rehearsing their password.

**This is the highest-value fix in the whole plan and it is independent of biometrics.**

### 1.4 SMS — yes, AWS has it and it works inside Amplify

Two distinct Cognito features, both reachable from Amplify:

- **SMS MFA** — `multifactor: { mode: 'OPTIONAL', sms: true }` in `defineAuth`; the
  client handles `CONFIRM_SIGN_IN_WITH_SMS_CODE` via `confirmSignIn`.
- **SMS OTP passwordless** — `loginWith.phone.otpLogin: true`, signed in through the
  `USER_AUTH` flow with `preferredChallenge: 'SMS_OTP'`.

This repo already sends SMS through Cognito for phone *attribute* verification
(`src/services/phoneVerificationService.ts` → `updateUserAttribute` /
`confirmUserAttribute`), so the SNS wiring is at least partly proven in production.

Caveats before leaning on SMS: US A2P traffic needs 10DLC brand/campaign registration,
the SNS account must be out of the SMS sandbox, there is a per-message cost on a betting
app's login volume, and SMS is the most phishable and SIM-swappable factor available.
Given that this app moves real money, SMS is a fallback, not the primary factor.

### 1.5 Cognito constraint: MFA and passwordless are mutually exclusive

> "Amazon Cognito does not support enabling both MFA and passwordless sign-in
> (including passkeys, SMS OTP, and email OTP) for the same user."

We cannot have email-OTP-as-first-factor *and* a second factor. This is a fork in the
road and needs an explicit decision (see §6, Decision B).

### 1.6 Infrastructure prerequisites we do not currently meet

| Feature | Prerequisite | Status |
| --- | --- | --- |
| Passkeys, email MFA, email/SMS OTP | Cognito **Essentials** feature plan (not Lite) | Unverified — check console. Pools created recently default to Essentials |
| Email MFA **and** email OTP | User pool sends via **your own Amazon SES** | Not configured. Needs SES production access + verified sender domain |
| SMS MFA / SMS OTP | SNS out of sandbox + 10DLC registration | Partly proven via phone verification — verify |
| Any new native module | `android/` is committed to git (bare workflow) | Needs `npx expo prebuild -p android` or a manual manifest edit |

Note the SES dependency in particular: **both** email-based options (email MFA and
email OTP passwordless) require it. That is a real chunk of setup work that has to
happen before either can ship, and it is why the biometric layer is sequenced first.

---

## 2. Recommended architecture

Four layers, in the order they should ship. Layers 1–3 need **no backend change at all**
and can go out on the next build.

```
Layer 3  Account recovery      forgot-password + reset          ← ship first, unblocks everything
Layer 1  Biometric unlock      Face ID / fingerprint on open    ← the "biometrics" ask
Layer 2  Biometric step-up     re-prompt before money moves
Layer 4  Factor upgrade        email MFA *or* email OTP         ← needs SES + Essentials + a decision
Layer 5  Real passkeys         when Amplify RN ships WebAuthn   ← future, tracked not built
```

### Layer 1 — Biometric app unlock

Cognito refresh tokens already persist the session across launches; today the app just
lets anyone who picks up an unlocked phone straight into a betting balance. The fix is
a local gate, not a new Cognito factor.

- On cold start, if a session exists **and** the user has enabled biometric unlock,
  show a lock screen and call `LocalAuthentication.authenticateAsync()`.
- On return to foreground after an idle threshold (start at 5 minutes, make it a
  constant), re-lock.
- Fallbacks: device passcode via `LocalAuthentication` fallback, then "Sign in with
  password" which does a real `signOut()` + normal login.
- Enrollment is opt-in, prompted once after a successful password login on a device
  that has biometrics enrolled.

**Also move Amplify's token storage to `expo-secure-store`.** Amplify defaults to
AsyncStorage on RN, which is plaintext on a rooted/jailbroken device. A small adapter
class passed to `cognitoUserPoolsTokenProvider.setKeyValueStorage()` moves the refresh
token into Keychain/Keystore. A biometric lock over plaintext tokens is theatre; this
is the change that makes it real.

Caveat on that adapter: `setKeyValueStorage` overrides the **TokenStore only**, not the
IdentityIdStore, and `expo-secure-store` has a ~2 KB per-value limit that Cognito ID
tokens with many claims can approach. The adapter needs chunking or a size assertion,
and this should be load-tested against a real token before shipping.

### Layer 2 — Biometric step-up for money actions

Re-prompt for biometrics immediately before:

- withdrawal requests (`PaymentMethodsScreen` / transaction flows)
- adding or changing a payment method
- Stripe deposits above a threshold
- admin transaction approve/reject in `AdminDashboardScreen`

This is where biometrics earn their keep on a money app, and it is cheap once Layer 1
exists — one `requireBiometric()` helper called from each action.

### Layer 3 — Account recovery (ship first)

Build the missing `ForgotPassword` flow with `resetPassword` / `confirmResetPassword`
from `aws-amplify/auth`, wire the route that `navigation.ts` already declares, and add
the link to `Login.tsx`. Also add `autoSignIn` after `confirmSignUp` so new users are
not bounced back to the login form (`SignUp.tsx:158` currently sends them back).

### Layer 4 — Factor upgrade (decision required)

Once SES is configured and the pool is confirmed on Essentials, pick **one**:

- **Option A — Email MFA.** Keep password as first factor, add an emailed code as a
  second. Closest to what the half-built 2FA was trying to be, no authenticator app,
  no SMS cost. Users keep a password.
- **Option B — Email OTP passwordless.** Password stops being the primary path; users
  enter email, get a code, done. Best UX, and it pairs well with biometric unlock
  (code once per device, biometrics thereafter). But it rules out any second factor
  (§1.5), and the account is then only as strong as the email inbox.

Recommendation: **Option A**, for a money app. Passwordless-by-email collapses account
security to inbox security, and a compromised inbox on a betting app with a balance and
linked payment methods is a bad failure mode. Option A keeps two independent factors
while still never asking anyone to install an authenticator app.

---

## 3. What gets removed

- `TrustSafetyScreen.tsx` — the entire `TwoFactorAuthModal` component (~lines 749–950),
  its `setUpTOTP` / `verifyTOTPSetup` / `updateMFAPreference` / `fetchMFAPreference`
  imports, the `show2FAModal` / `mfaEnabled` state, `checkMFAStatus()`, and the
  "Two-Factor Authentication" menu row.
- The "Works with any authenticator app" benefit copy.
- `TrustSafetyScreen.tsx:413` — "Enable SMS two-factor authentication" as a stated
  benefit of phone verification. Either drop it or restate it honestly once §6
  Decision B lands.
- `src/types/auth.ts:110` — replace the placeholder `BiometricConfig` with the real
  type the biometric service uses.

The Security section of Trust & Safety then becomes: Change Password · Biometric Unlock ·
(later) Two-Factor Authentication.

---

## 4. Phased implementation

### Phase 0 — Verify (no code)
1. Cognito console: confirm feature plan (Lite vs Essentials) on the deployed pool.
2. Confirm MFA configuration is OFF and no user has an active TOTP factor.
3. Confirm SNS SMS sandbox status and 10DLC registration state.
4. Decide whether SES setup is in scope this cycle.

### Phase 1 — Recovery + signup polish
- `src/components/ForgotPassword.tsx` (new) — request code → confirm code + new password.
- `App.tsx` — add `'forgotPassword'` to the `AuthScreen` union and render it.
- `Login.tsx` — "Forgot password?" link.
- `SignUp.tsx` — `autoSignIn` after `confirmSignUp`.
- No backend change. Independently shippable.

### Phase 2 — Secure token storage
- `src/services/secureTokenStorage.ts` (new) — `KeyValueStorageInterface` adapter over
  `expo-secure-store`, with chunking/size guard.
- `App.tsx` — `cognitoUserPoolsTokenProvider.setKeyValueStorage(...)` before
  `Amplify.configure`.
- `npx expo install expo-secure-store`; `npx expo prebuild -p android`.
- Migration: existing sessions live in AsyncStorage and will not be found in
  SecureStore. Either one-time copy-forward on first launch, or accept that every user
  signs in once after this build — **which is exactly why Phase 1 ships first.**

### Phase 3 — Biometric unlock
- `npx expo install expo-local-authentication`; add its config plugin to `app.json`
  with a `faceIDPermission` string; re-prebuild Android.
- `src/services/biometricAuthService.ts` (new) — capability probe
  (`hasHardwareAsync` / `isEnrolledAsync` / `supportedAuthenticationTypesAsync`),
  `authenticate()`, enable/disable persisted in SecureStore.
- `src/contexts/AuthContext.tsx` — `isLocked` state, AppState-driven re-lock (the file
  already tracks AppState at `appStateRef`), `unlock()`.
- `src/components/BiometricLockScreen.tsx` (new) — follows MODAL_STANDARDS.md and the
  design tokens.
- `App.tsx` — render the lock screen when `user && isLocked`.
- `TrustSafetyScreen.tsx` — replace the 2FA row with a "Biometric Unlock" toggle.
- Web: `expo-local-authentication` is a no-op on web; the whole layer must degrade to
  "always unlocked" there. `Platform.OS === 'web'` guards throughout.

### Phase 4 — Biometric step-up
- `requireBiometric(reason)` helper; call sites in withdrawal, payment-method, and
  admin approval flows.

### Phase 5 — Factor upgrade (gated on Phase 0 + Decision B)
- SES: verify domain, request production access, wire `senders` in `defineAuth`.
- `amplify/auth/resource.ts` — add `multifactor` (Option A) or `otpLogin` (Option B).
- `amplify/backend.ts` — `backend.auth.resources.cfnResources.cfnUserPool` override for
  `userPoolTier: 'ESSENTIALS'` if the pool is on Lite.
- `Login.tsx` — handle the `nextStep` branches (`CONTINUE_SIGN_IN_WITH_EMAIL_SETUP`,
  `CONFIRM_SIGN_IN_WITH_EMAIL_CODE`) via `confirmSignIn`.
- New enrollment UI in Trust & Safety.

---

## 5. Real passkeys — the future path

Three ways this could eventually happen, in ascending order of pain:

1. **Wait for Amplify.** The Cognito backend already supports WebAuthn; the gap is
   purely client-side in `amplify-js`. When RN support lands, the change is small
   *provided* Layer 4 chose Option A and we are willing to move off MFA (§1.5 —
   passkeys are passwordless, so they collide with MFA the same way).
2. **Managed Login in a web view.** `signInWithRedirect` + `expo-web-browser` against
   Cognito's hosted Managed Login, which supports passkeys today because it is a real
   browser context. Works now, but replaces the custom login screen with a hosted page,
   needs a Cognito domain, and the passkey is bound to that domain rather than the app.
3. **Hand-rolled.** `react-native-passkey` + direct `StartWebAuthnRegistration` /
   `CompleteWebAuthnRegistration` calls and a `USER_AUTH` challenge loop, plus a custom
   `tokenProvider` to inject the resulting tokens into Amplify. High effort, high risk,
   and it means owning a parallel auth stack. Not recommended.

Either of 1 or 2 additionally requires Apple Associated Domains + an
`apple-app-site-association` file, and an Android Digital Asset Links `assetlinks.json`
granting `get_login_creds` — i.e. a real HTTPS domain serving well-known files. Worth
noting: production today is Android-APK-only (`eas.json`), and `ios/` is gitignored, so
the iOS half of that work is not currently exercised.

---

## 6. Decisions needed before implementation

**A. Scope of this cycle.** Layers 1–3 (biometric unlock, step-up, recovery) with no
backend change — or include Layer 4, which pulls in SES setup and a Cognito feature-plan
check?

**B. Second factor vs passwordless.** Email MFA (recommended) or email OTP passwordless?
They are mutually exclusive in Cognito and the choice constrains the passkey path later.

**C. SMS.** Keep it purely for phone *verification* as today, or promote it to an
auth factor? (Recommend: keep as verification only.)

**D. Re-lock threshold.** 5 minutes suggested. Trading off convenience against a
shared/lost-phone scenario on an app holding a cash balance.

**E. Token-storage migration.** One-time copy-forward from AsyncStorage, or accept a
single forced re-login on the build that ships Phase 2?

---

## 7. Risks

- **Lockout.** Anything touching pool MFA config or token storage risks locking out
  live users. Phase 1 (recovery) ships first specifically to de-risk this.
- **SecureStore size limit.** ~2 KB per value vs. Cognito ID tokens with many claims —
  measure before shipping Phase 2.
- **Committed `android/`.** Native module additions need a prebuild; the diff will touch
  the checked-in Android project. Review that diff rather than rubber-stamping it.
- **Web parity.** This app runs on web (`react-native-web`, service worker, web push).
  Biometrics are native-only; every gate needs a web path that degrades cleanly.
- **`jsEngine: jsc`.** Both platforms are pinned to JSC, not Hermes. Verify new native
  modules against JSC rather than assuming defaults.
- **Cost.** Essentials is ~$0.015/MAU vs Lite. On a growing user base that is a real
  line item, and it is a prerequisite for every Layer 4 and Layer 5 option.

---

## Sources

- [Manage WebAuthn credentials — Amplify Gen 2 (React Native)](https://docs.amplify.aws/react-native/build-a-backend/auth/manage-users/manage-webauthn-credentials/)
- [Passwordless — Amplify Gen 2](https://docs.amplify.aws/react/build-a-backend/auth/concepts/passwordless/)
- [Multi-factor authentication — Amplify Gen 2](https://docs.amplify.aws/react-native/build-a-backend/auth/concepts/multi-factor-authentication/)
- [Multi-step sign-in — Amplify Gen 2 (React Native)](https://docs.amplify.aws/react-native/build-a-backend/auth/connect-your-frontend/multi-step-sign-in/)
- [Modify Amplify-generated Cognito resources with CDK](https://docs.amplify.aws/react/build-a-backend/auth/modify-resources-with-cdk/)
- [Amazon Cognito pricing / feature plans](https://aws.amazon.com/cognito/pricing/)
- [Troubleshoot Amazon Cognito MFA errors — AWS re:Post](https://repost.aws/knowledge-center/cognito-mfa-errors)
- [Implement passwordless authentication for Cognito users — AWS re:Post](https://repost.aws/knowledge-center/cognito-passwordless-authentication)
- [expo-local-authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/)
- [react-native-passkey](https://github.com/f-23/react-native-passkey)
