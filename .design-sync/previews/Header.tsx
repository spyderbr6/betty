import React from 'react';
import { Header, SideBetProvider, View } from 'sidebet-ui';

const frame = { width: 390 };

export const Default = () => (
  <View style={frame}><Header /></View>
);

export const WithTitle = () => (
  <View style={frame}><Header title="Account" /></View>
);

export const NoBalance = () => (
  <View style={frame}><Header showBalance={false} /></View>
);

export const ManyUnread = () => (
  <SideBetProvider unreadCount={128} balance={1840.25}>
    <View style={frame}><Header /></View>
  </SideBetProvider>
);
