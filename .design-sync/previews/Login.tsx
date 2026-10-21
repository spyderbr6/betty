import React from 'react';
import { Login, SideBetProvider, View } from 'sidebet-ui';

const noop = () => {};

// Full-screen auth screen: rendered signed out inside a phone-sized frame.
export const Default = () => (
  <SideBetProvider user={null}>
    <View style={{ width: 390, height: 844 }}>
      <Login onSignUpPress={noop} onForgotPasswordPress={noop} onLoginSuccess={noop} />
    </View>
  </SideBetProvider>
);

export const SmallPhone = () => (
  <SideBetProvider user={null}>
    <View style={{ width: 360, height: 690 }}>
      <Login onSignUpPress={noop} onForgotPasswordPress={noop} onLoginSuccess={noop} />
    </View>
  </SideBetProvider>
);
