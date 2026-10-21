# design-sync notes - SideBet

SideBet is an Expo / React Native **app**, not a published component library. The
sync works by building a library view of the app's own components.

## Re-sync recipe (Windows, Git Bash; repo root)
1. Stage the converter (instant): copy package-build/validate/capture/resync.mjs,
   lib/ and storybook/ from the design-sync skill dir into `.ds-sync/`; on a fresh
   clone also `cd .ds-sync && npm i esbuild ts-morph @types/react playwright@1.56.1`
   (1.56.1 matches the cached chromium-1194).
2. Make sure `amplify_outputs.json` exists (canvas data-client schema - see below).
3. `node .design-sync/lib/build.mjs` (cfg.buildCmd) - rebuilds the library from src/.
4. Fetch `_ds_sync.json` from the project into `.design-sync/.cache/remote-sync.json`,
   then `node .ds-sync/resync.mjs --config .design-sync/config.json
   --node-modules ./node_modules --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json`.
5. Editing `.design-sync/overrides/dts.mjs` (or any fork) resets EVERY grade - all 46
   come back as pendingGrade. Budget a full regrade pass when touching it.

## How the build works
- `.design-sync/lib/` is a private package (`sidebet-ui`). `index.ts` re-exports the
  app's components from `src/components/**`, the `src/styles` tokens, a few
  react-native primitives, and `SideBetProvider`. **New components must be added to
  `index.ts` by hand** - nothing discovers them.
- `cfg.buildCmd` (`node .design-sync/lib/build.mjs`) must run before the converter.
  It needs the staged converter deps (`.ds-sync/node_modules`: esbuild, plus the
  converter's `lib/bundle.mjs` for its React shim), so stage `.ds-sync/` first.
- build.mjs mirrors `metro.config.js` for web: `react-native` -> `react-native-web`,
  `@stripe/stripe-react-native` -> `src/web/stripe-react-native.tsx`,
  `crypto` -> `react-native-get-random-values`, `.web.*` resolution first.
  If Metro's web config changes, update build.mjs to match.
- `@env` (react-native-dotenv) is aliased to `lib/env-stub.ts` so `.env`
  (GITHUB_TOKEN) is never bundled. Keep it that way; grep the bundle for `ghp_`
  if in doubt.
- `node:async_hooks` (expo-font's static-render context) -> `lib/async-hooks-stub.ts`.
- `process.env` is defined as a fixed object `{EXPO_OS:"web",NODE_ENV:"production"}`
  instead of shimming `process`: Amplify sniffs `typeof process` for Node.
- React: build.mjs reuses the converter's `reactShim` so every `react`/`react-dom`
  import (including CommonJS `require('react')` in deps) is the page's `window.React`.
  Leaving react `external` instead produces a runtime `__require` throw.
- `dist/tokens.css` is generated from `src/styles` (`--sb-color-*`, `--sb-space-*`,
  `--sb-radius-*`, `--sb-font-size-*`, `--sb-font-weight-*`) and shipped as `cfg.cssEntry`.
- `tsc` over `lib/tsconfig.json` emits the .d.ts tree. It reports pre-existing app
  type errors (TS2590 "union too complex" in services, `colors.secondary` in
  SquaresGrid, ...) - declarations are still emitted; not this sync's problem.

## Contexts / SideBetProvider
- App contexts (`AuthContext`, `ProfileContext`, `BetDataContext`,
  `EventCheckInContext`, `NotificationContext`) are module-private. build.mjs's
  `contextExports` plugin appends `export { XContext }` while bundling - app source
  is untouched.
- `SideBetProvider` (`lib/SideBetProvider.tsx`) feeds those real contexts sample
  values (signed-in "Jordan Miles", balance 250, empty bet lists, 3 unread) plus
  `SafeAreaProvider` and the dark `colors.background`. It is `cfg.provider`, so every
  preview is wrapped. A story can nest its own `<SideBetProvider ...>` to override
  (e.g. `myParticipation`, `myBets`, `user={null}`).
- Amplify IS configured on the canvas, against an unreachable host:
  build.mjs writes `dist/canvas-amplify.json` (only `model_introspection` copied from
  the local `amplify_outputs.json`; url / api_key are fakes) and SideBetProvider calls
  `Amplify.configure` with it at module load. Unconfigured, `client.models.X.onCreate()`
  throws synchronously outside components' try/catch (it crashed TabBar). Now calls fail
  over the network into the catch blocks -> empty/error states. If `amplify_outputs.json`
  is absent at build time the config is skipped (log line) and those throws return.
  Never copy anything but `model_introspection` from it; the build greps clean today.
- SideBetProvider also mounts `NavigationIndependentTree > NavigationContainer`:
  `Header` calls `useNavigation()`, which v7 resolves to the container's root object.
- SideBetProvider props: user, balance, myBets, joinableBets, betInvitations,
  squaresInvitations, mySquaresGames, joinableSquaresGames, myParticipation,
  friendIds, checkedInEvent, unreadCount, background. Pass data via component props
  wherever the component allows it; these only cover context-sourced data.

## Type contracts
- `.design-sync/overrides/dts.mjs` (fork, see `cfg.libOverrides`): appends the
  declarations of in-repo types a component's props reference (`Bet`, `User`,
  `LiveEvent`, ...) into the emitted `<Name>.d.ts`. Without it, props read `bet: Bet`
  with `Bet` undeclared.

## Preview authoring learnings
- Import everything from `'sidebet-ui'` (components, `View`/`Text`/..., tokens).
- Previews render on a dark background via the provider; give stories a fixed
  width (~360-380) for mobile-width components, padding 16.
- `BetCard`'s `variant="compact"` is declared but never read by the component -
  don't author a Compact story (it renders identically).
- Dates: build them relative to `Date.now()` so countdowns read sensibly.
- Modals (`<Modal visible>` from react-native-web) render full-viewport overlays:
  use `cfg.overrides.<Name>: {"cardMode": "single", "viewport": "390x844"}`.
- Lists that a component loads itself from AWS on open (FriendRequestsModal,
  EventDiscoveryModal, NotificationModal, the friend list in BetInviteModal /
  SquaresInviteModal) can only show their empty state - no prop carries the data.
  Filling them would need a canvas-side fake of the Amplify data client
  (a possible future build.mjs alias); not done.
- QRScannerModal: camera permission is denied on the canvas, so only the
  "Camera Access Required" view renders.
- `SquaresInviteModal.game` is typed `any`; its header reads `id`, `title`,
  `status`, `totalPot`, `squaresSold`, `pricePerSquare`, `locksAt`.
- CustomAlert is a transparent Modal: its dim backdrop sits over the page, not the
  dark app background. Expected.
- Write preview files with the Write tool, not a Git Bash heredoc (apostrophes in
  comments broke heredocs with "unexpected EOF"). `python` isn't on PATH; use `node -e`.

### Capture / layout
- Grid-mode capture is a 900x700 viewport and NOT full-page: anything taller is
  silently clipped. Keep grid stories <= ~680px; phone-height screens go to
  `cardMode: "single"` with a `viewport`.
- Single cards get ~24px side margins: a 390-wide frame needs a ~440-wide viewport
  (Login, ForgotPassword, SignUp 440x1100, NotificationPreferencesPanel 440x1800).
- Phone-width (360-390) stories in grid mode trip `[GRID_OVERFLOW]`; those components
  use `cardMode: "column"` (applied from validate's suggestedOverride).
- `SquaresGrid` sizes cells from `Dimensions.get('window').width`, so it needs a phone
  viewport (single 390x844) and its frame reaches 16px into the card margins
  (`marginHorizontal: -16`) to get the room it has in-app.
- `flex: 1` roots (BetList, CreateSquaresForm, onboarding steps) need an explicit frame
  height or they collapse.
- Headless capture Chromium reports `Notification.permission === 'denied'`:
  `PushSoftAsk.tsx` redefines it to `'default'` at module scope (preview page only);
  NotificationPreferencesPanel shows its real "blocked for this site" row.
- Capture clock is frozen; `Date.now()`-relative dates still read sensibly.
- `<Image>` avatars: use `data:image/svg+xml;base64,` + `btoa`, not `;utf8,` (fails).

### Canvas-reachable states (honest limits - not bugs to chase)
- Data the component fetches itself with no prop: FriendRequestsModal,
  EventDiscoveryModal, NotificationModal, EventPickerModal, CreateSquaresForm,
  invite-modal friend lists -> empty states; WithdrawFundsModal -> only "No Venmo
  Accounts"; QRScannerModal -> only "Camera Access Required".
- AddFundsModal: only amount entry (later steps need a real Stripe payment).
- Auth screens: only their first step (confirm steps/error banners need Cognito).
- Declared-but-unread props, so no variant story: `BetCard.variant="compact"`,
  `OnboardingAddFundsStep.fundsAdded`.
- LiveBetCard's "TIME LEFT 03:42" / "CONFIDENCE 68%" are hardcoded in the component.
- BetInvitationCard: head-to-head (`maxParticipants: 2`) ignores `invitedSide`; pools
  need `odds.options` (3-6 names).
- CreateSquaresForm: below ~380px content width the PAYOUT STRUCTURE badge is pushed
  off the right edge (no flex-shrink in the header row) - an app layout bug.

## Known render warns
- `[RENDER_THIN]` "rendered height 0-1px" on every single-card Modal component
  (AddFriendModal, AddFundsModal, AddPaymentMethodModal, BetInviteModal,
  BetQRCodeModal, CustomAlert, EventDiscoveryModal, FeedbackModal, FileDisputeModal,
  FriendRequestsModal, NotificationModal, PolicyModal, QRScannerModal,
  SquaresInviteModal, VerifyPhoneModal, WithdrawFundsModal, EventPickerModal,
  PurchaseSquaresModal): react-native-web's Modal portals to a fixed overlay, so the
  root measures empty. They render fully - confirmed in the 390x844 captures.
- Contact-sheet thumbnails of those modals look right-cropped: validate screenshots
  at its own wide viewport. The per-cell review captures are authoritative.

## Re-sync risks
- `SideBetProvider`'s fake context values must track the real context value
  types in `src/contexts/*`. A new field consumed by a component will be undefined
  on the canvas (likely a crash in that card).
- build.mjs duplicates Metro's web aliases - drift breaks the bundle.
- The barrel (`lib/index.ts`) is a hand-maintained list of components.
- The canvas Amplify config copies `model_introspection` from the developer's local,
  gitignored `amplify_outputs.json` - a clone without it builds a bundle where data
  calls throw again (TabBar etc.). Schema changes flow in only on rebuild.
- `PushSoftAsk.tsx` patches `Notification.permission`; if the component's gate moves
  off the browser permission, the patch silently stops mattering.
- `SquaresGrid.tsx`'s negative margin is tuned to the card's ~24px margin.
