/**
 * Settings Screen
 * Notification settings, privacy and app preferences
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { NotificationPreferencesPanel } from '../components/settings/NotificationPreferencesPanel';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { showAlert } from '../components/ui/CustomAlert';

const client = generateClient<Schema>();

interface SettingsScreenProps {
  onClose: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [allowPhoneDiscovery, setAllowPhoneDiscovery] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    if (!user) return;

    try {
      const { data: userData } = await client.models.User.get({ id: user.userId });
      if (userData) {
        setAllowPhoneDiscovery(userData.allowPhoneDiscovery || false);
        setIsPublic(userData.isPublic !== undefined ? userData.isPublic : true);
      }
    } catch (error) {
      console.error('[SettingsScreen] Error loading privacy settings:', error);
    }
  };

  const handlePhoneDiscoveryToggle = async (value: boolean) => {
    if (!user) return;

    // Optimistic update
    const previousValue = allowPhoneDiscovery;
    setAllowPhoneDiscovery(value);

    try {
      // Update database
      const result = await client.models.User.update({
        id: user.userId,
        allowPhoneDiscovery: value,
      });

      if (!result.data) {
        // Revert on failure
        setAllowPhoneDiscovery(previousValue);
        showAlert('Error', 'Failed to update privacy setting. Please try again.');
      }
    } catch (error) {
      console.error('[SettingsScreen] Error updating phone discovery:', error);
      // Revert on failure
      setAllowPhoneDiscovery(previousValue);
      showAlert('Error', 'Failed to update privacy setting. Please try again.');
    }
  };

  const handleAccountPrivacyToggle = async (value: boolean) => {
    if (!user) return;

    // Optimistic update
    const previousValue = isPublic;
    setIsPublic(value);

    try {
      // Update database
      const result = await client.models.User.update({
        id: user.userId,
        isPublic: value,
      });

      if (!result.data) {
        // Revert on failure
        setIsPublic(previousValue);
        showAlert('Error', 'Failed to update account privacy. Please try again.');
      }
    } catch (error) {
      console.error('[SettingsScreen] Error updating account privacy:', error);
      // Revert on failure
      setIsPublic(previousValue);
      showAlert('Error', 'Failed to update account privacy. Please try again.');
    }
  };
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Settings" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {user && <NotificationPreferencesPanel userId={user.userId} />}

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIVACY</Text>

          <SettingRow
            icon="eye-outline"
            title="Public Account"
            subtitle="Allow others to find you in friend search"
            value={isPublic}
            onValueChange={handleAccountPrivacyToggle}
          />

          <View style={styles.privacyNote}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.privacyNoteText}>
              When enabled, other users can find your account by searching for your email or name. Existing friends are unaffected if you turn this off.
            </Text>
          </View>

          <SettingRow
            icon="phone-portrait-outline"
            title="Phone Number Discovery"
            subtitle="Allow friends to find you by your phone number"
            value={allowPhoneDiscovery}
            onValueChange={handlePhoneDiscoveryToggle}
          />

          <View style={styles.privacyNote}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.privacyNoteText}>
              When enabled, friends who have your phone number can find your profile. Your number is never publicly displayed.
            </Text>
          </View>
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
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.info + '10',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  privacyNoteText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
    lineHeight: 18,
  },
});
