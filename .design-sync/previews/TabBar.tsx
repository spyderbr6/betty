import React from 'react';
import { TabBar, SideBetProvider, View } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

// The tabs AppNavigator registers, in order. TabBar reads only state.routes /
// state.index, descriptors[key].options and navigation.emit/navigate.
const routeNames = ['Bets', 'Resolve', 'Create', 'Live', 'Account'];
const labels: Record<string, string> = { Bets: 'Active', Resolve: 'Results', Create: 'Create', Live: 'Join', Account: 'Account' };

const makeProps = (focused: string) => {
  const routes = routeNames.map((name) => ({ key: `${name}-key`, name, params: undefined }));
  const descriptors = Object.fromEntries(
    routes.map((r) => [r.key, { options: { tabBarLabel: labels[r.name], tabBarAccessibilityLabel: labels[r.name] } }]),
  );
  const navigation = {
    emit: () => ({ defaultPrevented: false }),
    navigate: () => {},
  };
  return {
    state: { index: routeNames.indexOf(focused), routes, routeNames, key: 'tab', type: 'tab', stale: false, history: [] },
    descriptors,
    navigation,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const frame = { width: 390 };

const invite = (id: string, from: string) => ({
  id,
  betId: `bet-${id}`,
  fromUserId: from,
  toUserId: 'user-jordan',
  status: 'PENDING' as const,
  invitedSide: 'A',
  createdAt: hours(-2),
  updatedAt: hours(-2),
  expiresAt: hours(22),
}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

// TabBar's friend-request effect calls client.models.FriendRequest.onCreate outside
// its try/catch, and Amplify is not configured on the canvas, so with a signed-in
// user the card throws. user={null} skips that effect. Its only visible cost is the
// Results badge, which counts the viewer's own PENDING_RESOLUTION bets.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Bar = ({ focused, betInvitations }: { focused: string; betInvitations?: any[] }) => (
  <SideBetProvider user={null} betInvitations={betInvitations}>
    <View style={frame}><TabBar {...makeProps(focused)} /></View>
  </SideBetProvider>
);

export const Default = () => <Bar focused="Bets" />;

export const CreateFocused = () => <Bar focused="Create" />;

export const AccountFocused = () => <Bar focused="Account" />;

export const WithInvitations = () => (
  <Bar focused="Account" betInvitations={[invite('i1', 'user-sam'), invite('i2', 'user-ava'), invite('i3', 'user-li')]} />
);
