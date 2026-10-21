import React from 'react';
import { PushSoftAsk, View } from 'sidebet-ui';

// PushSoftAsk only renders while the browser has not been asked yet
// (Notification.permission === 'default'). Headless capture browsers report
// 'denied', which hides it - so this preview page reports 'default'. Scoped to
// this card's page; the component itself is unchanged.
if (typeof window !== 'undefined' && 'Notification' in window) {
  try {
    Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => 'default' });
  } catch {
    // Non-configurable in some browsers: the card falls back to rendering nothing.
  }
}

// Shown at the top of the notification feed while this device has not been asked for
// push permission yet (browser permission "default" and not dismissed).
export const Default = () => (
  <View style={{ width: 390, paddingBottom: 16 }}>
    <PushSoftAsk userId="user-jordan" />
  </View>
);

export const SmallPhone = () => (
  <View style={{ width: 320, paddingBottom: 16 }}>
    <PushSoftAsk userId="user-jordan" />
  </View>
);
