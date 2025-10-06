/**
 * Trust & Safety Screen
 * Security settings and account verification
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';

interface TrustSafetyScreenProps {
  onClose: () => void;
}

export const TrustSafetyScreen: React.FC<TrustSafetyScreenProps> = ({ onClose }) => {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Trust & Safety" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Security Status */}
        <View style={styles.statusSection}>
          <View style={styles.statusCard}>
            <Ionicons name="shield-checkmark" size={48} color={colors.success} />
            <Text style={styles.statusTitle}>Account Secure</Text>
            <Text style={styles.statusSubtitle}>Your account is protected</Text>
          </View>
        </View>

        {/* Security Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SECURITY</Text>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.info + '20' }]}>
                <Ionicons name="key-outline" size={22} color={colors.info} />
              </View>
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemTitle}>Change Password</Text>
                <Text style={styles.menuItemSubtitle}>Update your account password</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.warning + '20' }]}>
                <Ionicons name="finger-print-outline" size={22} color={colors.warning} />
              </View>
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemTitle}>Two-Factor Authentication</Text>
                <Text style={styles.menuItemSubtitle}>Not enabled</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Verification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VERIFICATION</Text>

          <View style={styles.verificationCard}>
            <View style={styles.verificationHeader}>
              <Ionicons name="mail" size={24} color={colors.success} />
              <Text style={styles.verificationTitle}>Email Verified</Text>
            </View>
            <Text style={styles.verificationEmail}>{user?.username}</Text>
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIVACY</Text>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="eye-off-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemTitle}>Profile Visibility</Text>
                <Text style={styles.menuItemSubtitle}>Friends only</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: colors.error + '20' }]}>
                <Ionicons name="ban-outline" size={22} color={colors.error} />
              </View>
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemTitle}>Blocked Users</Text>
                <Text style={styles.menuItemSubtitle}>Manage blocked accounts</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Safety Tips */}
        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>Safety Tips</Text>
          <TipItem
            icon="warning-outline"
            text="Never share your account password with anyone"
          />
          <TipItem
            icon="shield-outline"
            text="Enable two-factor authentication for added security"
          />
          <TipItem
            icon="people-outline"
            text="Only accept bets from people you trust"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

interface TipItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

const TipItem: React.FC<TipItemProps> = ({ icon, text }) => (
  <View style={styles.tipItem}>
    <Ionicons name={icon} size={20} color={colors.warning} />
    <Text style={styles.tipText}>{text}</Text>
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
  statusSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  statusTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.sm,
  },
  statusSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
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
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
  },
  menuItemSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  verificationCard: {
    backgroundColor: colors.success + '10',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.success + '30',
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  verificationTitle: {
    ...textStyles.button,
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.sm,
  },
  verificationEmail: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  tipsSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  tipsTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  tipText: {
    ...textStyles.body,
    color: colors.textSecondary,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 20,
  },
});
