import React from 'react';
import { PhoneInput, View } from 'sidebet-ui';

const pad = { padding: 16, width: 380 };
const noop = () => {};

export const Empty = () => (
  <View style={pad}>
    <PhoneInput value="" onChangeText={noop} label="Phone Number" placeholder="Enter your phone number" required />
  </View>
);

export const Valid = () => (
  <View style={pad}>
    <PhoneInput value="+13035550147" onChangeText={noop} label="Phone Number" required />
  </View>
);

export const WithError = () => (
  <View style={pad}>
    <PhoneInput value="+1303555" onChangeText={noop} label="New Phone Number" required error="Please enter a valid 10-digit US phone number" />
  </View>
);

export const Disabled = () => (
  <View style={pad}>
    <PhoneInput value="+17205550192" onChangeText={noop} label="Phone Number" disabled />
  </View>
);
