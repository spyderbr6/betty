import React from 'react';
import { ModalHeader, TouchableOpacity, Text, View, colors, textStyles, spacing } from 'sidebet-ui';

const close = () => {};

export const Close = () => <ModalHeader title="Send Feedback" onClose={close} />;

export const Back = () => <ModalHeader title="Payment Methods" onClose={close} variant="back" />;

export const WithAction = () => (
  <ModalHeader
    title="Create Bet"
    onClose={close}
    rightComponent={
      <TouchableOpacity
        onPress={close}
        style={{ backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: spacing.radius.md }}
      >
        <Text style={{ ...textStyles.button, color: colors.textInverse }}>Submit</Text>
      </TouchableOpacity>
    }
  />
);

export const LongTitle = () => (
  <View style={{ width: 360 }}>
    <ModalHeader title="Notification Preferences and Quiet Hours" onClose={close} />
  </View>
);
