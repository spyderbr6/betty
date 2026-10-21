# SideBet design system: how to build with it

SideBet is a dark-theme mobile betting app (React Native, rendered on the web with react-native-web).
Every component here is the app's real code. Build mobile screens around 390px wide.

## Setup: always wrap in `SideBetProvider`

Everything is on `window.SideBet`. Wrap the whole design in **one** `SideBetProvider`.
It supplies the app's auth, profile, bet-data, event check-in and notification contexts, plus safe-area insets, a navigation root and the dark `colors.background`.
Without it, any component that calls `useAuth()` (BetCard, Header, TabBar, UserBalance, ...) throws, and screens render on white.

```jsx
const { SideBetProvider, View, Header, BetCard, colors, spacing } = window.SideBet;

<SideBetProvider balance={250} unreadCount={3} myBets={[...]} myParticipation={{ 'bet-1': { side: 'A', amount: 20 } }}>
  <View style={{ width: 390, minHeight: 844 }}>{/* screen */}</View>
</SideBetProvider>
```

- Provider props: `user` (pass `null` for signed-out screens), `balance`, `myBets`, `joinableBets`, `betInvitations`, `squaresInvitations`, `mySquaresGames`, `joinableSquaresGames`, `myParticipation`, `friendIds`, `checkedInEvent`, `unreadCount`, `background`.
- The default viewer is `SAMPLE_USER`, "Jordan Miles", id `user-jordan`. A bet whose `creatorId` or `participantUserIds` includes `user-jordan` renders as yours.
- There is no backend on the canvas. Pass data in through props such as `bet`, `game` and `invitations`. Lists a component fetches for itself (friend requests, notifications, events) show their empty state.

## Styling idiom: React Native style objects + tokens (no CSS classes)

Lay out with the bundled primitives: `View`, `Text`, `ScrollView`, `FlatList`, `Image`, `TextInput`, `Pressable`, `TouchableOpacity`, `Switch`, `ActivityIndicator`, `StyleSheet`.
Use the icon sets `Ionicons`, `MaterialIcons` and `MaterialCommunityIcons` as `<Ionicons name="trophy" size={20} color={colors.primary} />`.
Style with `style={{...}}` objects built from tokens, never hard-coded values:

| Token object | Use |
|---|---|
| `colors` | `background` #111827, `surface`, `surfaceLight`, `surfaceElevated`, `border`, `textPrimary`, `textSecondary`, `textMuted`, `textInverse` (text on yellow), `primary` #EAB308 (brand yellow), `success`, `error`, `warning`, `info`, `live`, `active`, `pending`, `resolved`, `cancelled` |
| `spacing` | `xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `'2xl'`, `'3xl'`; `spacing.radius.{xs,sm,md,lg,xl,full}`; `spacing.card.padding` |
| `textStyles` | `h1`-`h4`, `body`, `bodyLarge`, `bodySmall`, `caption`, `label`, `button`, `buttonSmall`, `buttonLarge`, `amount`, `balance`, `pot`, `odds`, `status`, `hero` |
| `typography` | `fontSize.{xs,sm,base,lg,xl,'2xl','3xl','4xl'}`, `fontWeight.{normal,medium,semibold,bold}` |
| `commonStyles` | `screenContainer`, `card`, `betCard`, `liveBetCard`, `primaryButton`, `secondaryButton`, `textInput`, `statusBadge`, `flexCenter`, `flexBetween`, `border` |
| `shadows` | `card`, `betCard`, `liveBetCard`, `button`, `modal`, `header`, `fab` |

Rules from the app's own guide:
- Use margins between children, never `gap`.
- Primary actions are yellow (`colors.primary`) buttons with `colors.textInverse` text.
- Money is shown as `$20.00`, using `textStyles.amount` or `textStyles.pot` in `colors.primary` or `colors.success`.

For plain HTML/CSS glue outside RN components, the same tokens exist as CSS variables in `styles.css`: `--sb-color-*` (e.g. `--sb-color-surface`), `--sb-space-*`, `--sb-radius-*`, `--sb-font-size-*`, `--sb-font-family`.

## Where the truth lives

- `components/<group>/<Name>/<Name>.d.ts` is each component's props, plus the full domain types it takes (`Bet`, `BetOdds`, `BetInvitation`, `LiveEvent`, `User`, ...).
- `<Name>.prompt.md` gives usage examples taken from the verified previews.
- Read `styles.css` and its import `_ds_bundle.css` for the CSS variables.
- Modals (`AddFundsModal`, `BetInviteModal`, ...) take `visible` and `onClose` and cover the full screen. Headers inside custom sheets use `ModalHeader`.

## Example: a "My Bets" screen

```jsx
const { SideBetProvider, View, ScrollView, Text, Header, BetCard, TabBar, colors, spacing, textStyles } = window.SideBet;
const bet = { id: 'bet-1', title: 'Lakers beat the Celtics tonight', description: 'Final score, OT counts.',
  category: 'SPORTS', status: 'ACTIVE', creatorId: 'user-sam', creatorName: 'Sam Rivera', totalPot: 80, betAmount: 20,
  odds: { sideAName: 'Lakers', sideBName: 'Celtics' }, deadline: new Date(Date.now() + 3 * 3600e3).toISOString(),
  sideACount: 2, sideBCount: 2, participantUserIds: ['user-sam', 'user-ava', 'user-li', 'user-noah'],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

<SideBetProvider>
  <View style={{ width: 390, height: 844, backgroundColor: colors.background }}>
    <Header title="My Bets" />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={{ ...textStyles.h4, color: colors.textPrimary, marginBottom: spacing.sm }}>Active</Text>
      <BetCard bet={bet} onJoinBet={() => {}} />
    </ScrollView>
  </View>
</SideBetProvider>
```
