import React from 'react';
import { EventBadge, View } from 'sidebet-ui';

const row = { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, padding: 16 };
const cell = { marginRight: 12, marginBottom: 12 };

export const Default = () => (
  <View style={row}>
    <EventBadge sport="NBA" checkInCount={24} />
  </View>
);

export const Sports = () => (
  <View style={row}>
    <View style={cell}><EventBadge sport="NFL" checkInCount={112} /></View>
    <View style={cell}><EventBadge sport="MLB" checkInCount={8} /></View>
    <View style={cell}><EventBadge sport="NHL" checkInCount={1} /></View>
    <View style={cell}><EventBadge sport="SOCCER" checkInCount={37} /></View>
    <View style={cell}><EventBadge sport="COLLEGE_BASKETBALL" checkInCount={15} /></View>
  </View>
);

export const Sizes = () => (
  <View style={row}>
    <View style={cell}><EventBadge sport="NBA" checkInCount={24} size="small" /></View>
    <View style={cell}><EventBadge sport="NBA" checkInCount={24} size="medium" /></View>
    <View style={cell}><EventBadge sport="NBA" checkInCount={24} size="large" /></View>
  </View>
);

export const WithoutCount = () => (
  <View style={row}>
    <EventBadge sport="NFL" checkInCount={0} showCount={false} />
  </View>
);
