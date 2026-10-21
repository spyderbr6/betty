import React from 'react';
import { ForgotPassword, SideBetProvider, View } from 'sidebet-ui';

const noop = () => {};

// Opens on the "request code" step; the confirm step is reachable only after a Cognito call.
export const Default = () => (
  <SideBetProvider user={null}>
    <View style={{ width: 390, height: 844 }}>
      <ForgotPassword onBackToLogin={noop} />
    </View>
  </SideBetProvider>
);

export const SmallPhone = () => (
  <SideBetProvider user={null}>
    <View style={{ width: 360, height: 690 }}>
      <ForgotPassword onBackToLogin={noop} />
    </View>
  </SideBetProvider>
);
