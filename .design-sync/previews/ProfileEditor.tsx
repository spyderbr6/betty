import React from 'react';
import { ProfileEditor, View } from 'sidebet-ui';

const frame = { width: 390, height: 640 };

const user = {
  id: 'user-jordan',
  username: 'jordan.miles',
  email: 'jordan.miles@example.com',
  displayName: 'Jordan Miles',
  balance: 250,
  trustScore: 5,
  totalBets: 42,
  totalWinnings: 615,
  winRate: 0.57,
  createdAt: '2026-02-03T18:20:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

export const Default = () => (
  <View style={frame}>
    <ProfileEditor user={user} onSave={async () => {}} onCancel={() => {}} />
  </View>
);

export const NoDisplayName = () => (
  <View style={frame}>
    <ProfileEditor user={{ ...user, displayName: undefined }} onSave={async () => {}} onCancel={() => {}} />
  </View>
);

export const Saving = () => (
  <View style={frame}>
    <ProfileEditor user={user} onSave={async () => {}} onCancel={() => {}} loading />
  </View>
);
