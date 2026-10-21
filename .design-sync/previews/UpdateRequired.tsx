import React from 'react';
import { UpdateRequired, View } from 'sidebet-ui';

const frame = { width: 390, height: 640 };

export const WithStoreLink = () => (
  <View style={frame}>
    <UpdateRequired updateUrl="https://play.google.com/store/apps/details?id=com.sidebet.app" />
  </View>
);

export const CustomMessage = () => (
  <View style={frame}>
    <UpdateRequired
      updateUrl="https://apps.apple.com/app/sidebet/id6740000000"
      updateMessage="SideBet 2.4 changes how payouts are recorded. Update now to keep joining and settling bets."
    />
  </View>
);

export const NoLink = () => (
  <View style={frame}>
    <UpdateRequired />
  </View>
);
