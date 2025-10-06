/**
 * About Screen
 * App version and legal information
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';

interface AboutScreenProps {
  onClose: () => void;
}

export const AboutScreen: React.FC<AboutScreenProps> = ({ onClose }) => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="About" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* App Info */}
        <View style={styles.appInfoSection}>
          <View style={styles.appIconContainer}>
            <Ionicons name="dice" size={64} color={colors.primary} />
          </View>
          <Text style={styles.appName}>SideBet</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appTagline}>Peer-to-peer betting with friends</Text>
        </View>

        {/* Links */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://github.com/anthropics/claude-code')}
            activeOpacity={0.7}
          >
            <View style={styles.linkItemLeft}>
              <Ionicons name="document-text-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.linkItemText}>Terms of Service</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://github.com/anthropics/claude-code')}
            activeOpacity={0.7}
          >
            <View style={styles.linkItemLeft}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.linkItemText}>Privacy Policy</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://github.com/anthropics/claude-code')}
            activeOpacity={0.7}
          >
            <View style={styles.linkItemLeft}>
              <Ionicons name="help-circle-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.linkItemText}>Community Guidelines</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL('https://github.com/anthropics/claude-code')}
            activeOpacity={0.7}
          >
            <View style={styles.linkItemLeft}>
              <Ionicons name="logo-github" size={22} color={colors.textSecondary} />
              <Text style={styles.linkItemText}>Open Source</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Credits */}
        <View style={styles.creditsSection}>
          <Text style={styles.creditsTitle}>Built with</Text>
          <Text style={styles.creditsText}>React Native + Expo</Text>
          <Text style={styles.creditsText}>AWS Amplify Gen2</Text>
          <Text style={styles.creditsText}>TypeScript</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ for peer-to-peer betting
          </Text>
          <Text style={styles.copyright}>
            © 2025 SideBet. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  appInfoSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  appName: {
    ...textStyles.h1,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  appVersion: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  appTagline: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkItemText: {
    ...textStyles.button,
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  creditsSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  creditsTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  creditsText: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  footerText: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  copyright: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
