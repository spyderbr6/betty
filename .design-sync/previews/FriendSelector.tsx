import React from 'react';
import { FriendSelector, View } from 'sidebet-ui';

const friend = (id: string, displayName: string, username: string) => ({
  id, displayName, username, email: `${username}@example.com`,
  balance: 0, trustScore: 5, totalBets: 12, totalWinnings: 140, winRate: 0.55,
  createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
});

const friends = [
  friend('user-ava', 'Ava Chen', 'ava.chen'),
  friend('user-sam', 'Sam Rivera', 'samr'),
  friend('user-noah', 'Noah Patel', 'noah.p'),
  friend('user-priya', 'Priya Shah', 'priya_s'),
  friend('user-marcus', 'Marcus Lee', 'mlee'),
  friend('user-li', 'Li Wei', 'liwei'),
];

const box = { width: 380 };
const none = new Set<string>();

export const Default = () => (
  <View style={box}>
    <FriendSelector friends={friends} selectedFriends={none} onToggleFriend={() => {}} />
  </View>
);

export const WithSelection = () => (
  <View style={box}>
    <FriendSelector friends={friends} selectedFriends={new Set(['user-ava', 'user-noah'])} onToggleFriend={() => {}} />
  </View>
);

export const CustomLabels = () => (
  <View style={box}>
    <FriendSelector
      friends={friends}
      selectedFriends={new Set(['user-priya'])}
      onToggleFriend={() => {}}
      maxDisplay={4}
      label="CHALLENGE A FRIEND"
      sublabel="Pick who you want to go head-to-head with"
    />
  </View>
);

export const Empty = () => (
  <View style={box}>
    <FriendSelector friends={[]} selectedFriends={none} onToggleFriend={() => {}} />
  </View>
);
