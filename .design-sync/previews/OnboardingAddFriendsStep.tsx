import React from 'react';
import { OnboardingAddFriendsStep, View } from 'sidebet-ui';

const noop = () => {};
const frame = { width: 390, height: 680 };

export const NoFriendsYet = () => (
  <View style={frame}>
    <OnboardingAddFriendsStep friendsAdded={0} onFriendsAddedChange={noop} onComplete={noop} onSkip={noop} onBack={noop} />
  </View>
);

export const FriendsAdded = () => (
  <View style={frame}>
    <OnboardingAddFriendsStep friendsAdded={3} onFriendsAddedChange={noop} onComplete={noop} onSkip={noop} onBack={noop} />
  </View>
);

export const Finishing = () => (
  <View style={frame}>
    <OnboardingAddFriendsStep friendsAdded={1} onFriendsAddedChange={noop} onComplete={noop} onSkip={noop} onBack={noop} isLoading />
  </View>
);
