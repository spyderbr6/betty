import React from 'react';
import { SignUp, SideBetProvider, View } from 'sidebet-ui';

const noop = () => {};

// Full-screen auth screen: rendered signed out inside a phone-sized frame.
export const Default = () => (
  <SideBetProvider user={null}>
    <View style={{ width: 390, height: 1100 }}>
      <SignUp onLoginPress={noop} onSignUpSuccess={noop} />
    </View>
  </SideBetProvider>
);

export const SmallPhone = () => (
  <SideBetProvider user={null}>
    <View style={{ width: 360, height: 1100 }}>
      <SignUp onLoginPress={noop} onSignUpSuccess={noop} />
    </View>
  </SideBetProvider>
);
