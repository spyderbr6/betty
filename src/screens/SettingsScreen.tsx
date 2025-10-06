/**
 * Settings Screen
 * App preferences and notification settings
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';

interface SettingsScreenProps {
  onClose: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [betReminders, setBetReminders] = useState(true);
  const [friendActivity, setFriendActivity] = useState(true);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Settings" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>

          <SettingRow
            icon="notifications-outline"
            title="Push Notifications"
            subtitle="Receive push notifications for updates"
            value={pushNotifications}
            onValueChange={setPushNotifications}
          />

          <SettingRow
            icon="mail-outline"
            title="Email Notifications"
            subtitle="Receive email updates"
            value={emailNotifications}
            onValueChange={setEmailNotifications}
          />

          <SettingRow
            icon="time-outline"
            title="Bet Reminders"
            subtitle="Reminders for expiring bets"
            value={betReminders}
            onValueChange={setBetReminders}
          />

          <SettingRow
            icon="people-outline"
            title="Friend Activity"
            subtitle="Notifications for friend actions"
            value={friendActivity}
            onValueChange={setFriendActivity}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCES</Text>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="language-outline" size={22} color={colors.textSecondary} />
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemTitle}>Language</Text>
                <Text style={styles.menuItemSubtitle}>English</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="cash-outline" size={22} color={colors.textSecondary} />
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemTitle}>Currency</Text>
                <Text style={styles.menuItemSubtitle}>USD ($)</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

const SettingRow: React.FC<SettingRowProps> = ({ icon, title, subtitle, value, onValueChange }) => (
  <View style={styles.settingRow}>
    <View style={styles.settingRowLeft}>
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <View style={styles.settingRowText}>
        <Text style={styles.settingRowTitle}>{title}</Text>
        <Text style={styles.settingRowSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor={colors.background}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingRowText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  settingRowTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
  },
  settingRowSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  menuItemTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
  },
  menuItemSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
