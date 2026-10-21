import React from 'react';
import { NotificationPreferencesPanel, View } from 'sidebet-ui';

// Loads preferences from Amplify; with no backend on the canvas the service falls back to
// the defaults (push and banners on, nothing muted, quiet hours off), which is what renders.
export const Default = () => (
  <View style={{ width: 390 }}>
    <NotificationPreferencesPanel userId="user-jordan" />
  </View>
);
