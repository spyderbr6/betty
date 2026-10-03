/**
 * A card at the top of the notification feed offering to turn on push for this device,
 * shown only while the device has not been asked yet.
 *
 * Browsers only honour a permission prompt from a tap, and penalise sites that prompt on
 * load, so web never prompts on its own (NotificationService.registerPushToken). Without
 * this, the only way to turn push on in a browser was to find it in Settings. The card
 * asks first in the app's own words; the browser's dialog only appears after "Turn On".
 *
 * See PUSH_NOTIFICATION_GUIDE.md §6.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, commonStyles, spacing, textStyles } from '../../styles';
import { NotificationService } from '../../services/notificationService';

/** Set when the user taps "Not Now" on this device. Settings still offers push after that. */
const DISMISSED_KEY = 'sidebet.pushSoftAskDismissed';

export const PushSoftAsk: React.FC<{ userId: string }> = ({ userId }) => {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const permission = await NotificationService.getDevicePushPermission();
      if (permission !== 'undetermined') return;
      let dismissed: string | null = null;
      try {
        dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
      } catch {
        // Storage unavailable: ask, since "Not Now" is one tap away.
      }
      if (!cancelled && !dismissed) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  // Runs from the tap, so the browser will show its dialog.
  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await NotificationService.registerPushToken(userId, { prompt: true, force: true });
    } finally {
      // Whatever was answered, the question has been asked: the card's job is done.
      // Settings shows the outcome and how to undo a "Block".
      setBusy(false);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    AsyncStorage.setItem(DISMISSED_KEY, new Date().toISOString()).catch(() => {});
  };

  return (
    <View style={styles.card} testID="push-soft-ask">
      <View style={styles.row}>
        <Ionicons name="notifications-outline" size={24} color={colors.primary} style={styles.icon} />
        <View style={styles.textBlock}>
          <Text style={styles.title}>Get alerts on this device</Text>
          <Text style={styles.body}>
            Hear about results, payouts and invitations even when SideBet isn&apos;t open. You choose
            what alerts you in Settings.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[commonStyles.secondaryButton, styles.action]}
          onPress={handleDismiss}
          testID="push-soft-ask-dismiss"
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Not Now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.primaryButton, styles.action, busy && styles.busy]}
          onPress={handleEnable}
          disabled={busy}
          testID="push-soft-ask-enable"
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Turn On</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    ...commonStyles.card,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    marginRight: spacing.sm,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
  },
  action: {
    marginLeft: spacing.sm,
  },
  busy: {
    opacity: 0.6,
  },
  primaryText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
  secondaryText: {
    ...textStyles.button,
    color: colors.textPrimary,
  },
});
