import React from 'react';
import { UserBalance, SideBetProvider, View, colors } from 'sidebet-ui';

const row = { flexDirection: 'row' as const, alignItems: 'center' as const, padding: 16 };
const cell = { marginRight: 24 };

export const Default = () => (
  <View style={row}><UserBalance onPress={() => {}} /></View>
);

export const Sizes = () => (
  <View style={row}>
    <View style={cell}><UserBalance size="small" /></View>
    <View style={cell}><UserBalance size="medium" /></View>
    <View style={cell}><UserBalance size="large" /></View>
  </View>
);

export const Variants = () => (
  <View style={row}>
    <View style={cell}><UserBalance variant="default" /></View>
    <View style={cell}><UserBalance variant="compact" /></View>
    <View style={[cell, { backgroundColor: colors.surface, borderRadius: 8 }]}><UserBalance variant="header" /></View>
  </View>
);

export const WithoutLabel = () => (
  <View style={row}><UserBalance showLabel={false} size="large" /></View>
);

export const LargeBalance = () => (
  <SideBetProvider balance={12480.5}>
    <View style={row}><UserBalance size="large" /></View>
  </SideBetProvider>
);

export const ZeroBalance = () => (
  <SideBetProvider balance={0}>
    <View style={row}><UserBalance size="large" /></View>
  </SideBetProvider>
);
