import React from 'react';
import { SecuritySection, View } from 'sidebet-ui';

// Reads email / phone / MFA from Cognito in an effect; on the canvas those calls fail and
// are caught, so the section renders its signed-in defaults (no phone, 2FA off).
export const Default = () => (
  <View style={{ width: 390, paddingBottom: 16 }}>
    <SecuritySection />
  </View>
);
