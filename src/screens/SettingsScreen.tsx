/**
 * Settings Screen
 * App preferences and notification settings
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { NotificationPreferencesService } from '../services/notificationPreferencesService';
import { NotificationPreferences } from '../types/betting';

interface SettingsScreenProps {
  onClose: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const prefs = await NotificationPreferencesService.getUserPreferences(user.userId);
      setPreferences(prefs);
    } catch (error) {
      console.error('[SettingsScreen] Error loading preferences:', error);
      Alert.alert('Error', 'Failed to load notification settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!user || !preferences) return;

    // Optimistic update
    setPreferences(prev => prev ? { ...prev, [key]: value } : null);

    // Save to database
    const success = await NotificationPreferencesService.updatePreference(
      user.userId,
      key,
      value
    );

    if (!success) {
      // Revert on failure
      await loadPreferences();
      Alert.alert('Error', 'Failed to update preference. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Settings" onClose={onClose} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!preferences) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Settings" onClose={onClose} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Failed to load settings</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadPreferences}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Notification Settings" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Master Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MASTER CONTROLS</Text>

          <SettingRow
            icon="notifications-outline"
            title="Push Notifications"
            subtitle="Master switch for all push notifications"
            value={preferences.pushEnabled}
            onValueChange={(val) => handleToggle('pushEnabled', val)}
          />

          <SettingRow
            icon="phone-portrait-outline"
            title="In-App Notifications"
            subtitle="Show toast notifications while using app"
            value={preferences.inAppEnabled}
            onValueChange={(val) => handleToggle('inAppEnabled', val)}
          />

          <SettingRow
            icon="mail-outline"
            title="Email Notifications"
            subtitle="Receive email updates (coming soon)"
            value={preferences.emailEnabled}
            onValueChange={(val) => handleToggle('emailEnabled', val)}
          />
        </View>

        {/* Notification Types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATION TYPES</Text>

          <SettingRow
            icon="people-outline"
            title="Friend Requests"
            subtitle="New friend requests and acceptances"
            value={preferences.friendRequestsEnabled}
            onValueChange={(val) => handleToggle('friendRequestsEnabled', val)}
          />

          <SettingRow
            icon="mail-open-outline"
            title="Bet Invitations"
            subtitle="Invitations to join bets"
            value={preferences.betInvitationsEnabled}
            onValueChange={(val) => handleToggle('betInvitationsEnabled', val)}
          />

          <SettingRow
            icon="person-add-outline"
            title="Bet Activity"
            subtitle="When someone joins your bets"
            value={preferences.betJoinedEnabled}
            onValueChange={(val) => handleToggle('betJoinedEnabled', val)}
          />

          <SettingRow
            icon="trophy-outline"
            title="Bet Results"
            subtitle="When bets are resolved (won/lost)"
            value={preferences.betResolvedEnabled}
            onValueChange={(val) => handleToggle('betResolvedEnabled', val)}
          />

          <SettingRow
            icon="close-circle-outline"
            title="Bet Cancellations"
            subtitle="When bets are cancelled"
            value={preferences.betCancelledEnabled}
            onValueChange={(val) => handleToggle('betCancelledEnabled', val)}
          />

          <SettingRow
            icon="time-outline"
            title="Bet Deadlines"
            subtitle="Reminders for expiring bets"
            value={preferences.betDeadlineEnabled}
            onValueChange={(val) => handleToggle('betDeadlineEnabled', val)}
          />

          <SettingRow
            icon="wallet-outline"
            title="Payment Updates"
            subtitle="Deposits, withdrawals, and payment method verifications"
            value={preferences.paymentNotificationsEnabled}
            onValueChange={(val) => handleToggle('paymentNotificationsEnabled', val)}
          />

          <SettingRow
            icon="megaphone-outline"
            title="System Announcements"
            subtitle="App updates and important announcements"
            value={preferences.systemAnnouncementsEnabled}
            onValueChange={(val) => handleToggle('systemAnnouncementsEnabled', val)}
          />
        </View>

        {/* Do Not Disturb */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DO NOT DISTURB</Text>

          <SettingRow
            icon="moon-outline"
            title="Do Not Disturb"
            subtitle={
              preferences.dndEnabled && preferences.dndStartHour !== undefined && preferences.dndEndHour !== undefined
                ? `Quiet hours: ${preferences.dndStartHour}:00 - ${preferences.dndEndHour}:00`
                : 'Silence notifications during specific hours'
            }
            value={preferences.dndEnabled}
            onValueChange={(val) => handleToggle('dndEnabled', val)}
          />

          {preferences.dndEnabled && (
            <View style={styles.dndTimeContainer}>
              <Text style={styles.dndTimeLabel}>
                DND time configuration coming soon. Default: 10 PM - 7 AM
              </Text>
            </View>
          )}
        </View>

        {/* App Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APP PREFERENCES</Text>

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  errorText: {
    ...textStyles.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
  },
  retryButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
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
  dndTimeContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  dndTimeLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
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
