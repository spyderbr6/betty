import React from 'react';
import { OnboardingAddFundsStep, View } from 'sidebet-ui';

const noop = () => {};

// `fundsAdded` is accepted but not read by the component, so there is one visual state.
export const Default = () => (
  <View style={{ width: 390, height: 680 }}>
    <OnboardingAddFundsStep fundsAdded={false} onFundsAdded={noop} onNext={noop} onSkip={noop} onBack={noop} />
  </View>
);

export const SmallPhone = () => (
  <View style={{ width: 320, height: 640 }}>
    <OnboardingAddFundsStep fundsAdded={false} onFundsAdded={noop} onNext={noop} onSkip={noop} onBack={noop} />
  </View>
);
