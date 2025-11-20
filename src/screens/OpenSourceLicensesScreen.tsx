/**
 * Open Source Licenses Screen
 * Attribution for open source software used in SideBet
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';

interface OpenSourceLicensesScreenProps {
  onClose: () => void;
}

interface LicenseProps {
  name: string;
  version: string;
  license: string;
  description: string;
  url?: string;
}

const License: React.FC<LicenseProps> = ({ name, version, license, description, url }) => {
  return (
    <View style={styles.licenseItem}>
      <View style={styles.licenseHeader}>
        <Text style={styles.licenseName}>{name}</Text>
        <Text style={styles.licenseVersion}>v{version}</Text>
      </View>
      <Text style={styles.licenseType}>{license}</Text>
      <Text style={styles.licenseDescription}>{description}</Text>
      {url && (
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => Linking.openURL(url)}
          activeOpacity={0.7}
        >
          <Text style={styles.linkButtonText}>View License</Text>
          <Ionicons name="open-outline" size={14} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

export const OpenSourceLicensesScreen: React.FC<OpenSourceLicensesScreenProps> = ({ onClose }) => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Open Source Licenses" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.intro}>
            SideBet is built with love using open source software. We are grateful to the developers and communities who make these projects possible.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Core Technologies</Text>

          <License
            name="React Native"
            version="0.76.9"
            license="MIT License"
            description="A framework for building native apps using React"
            url="https://github.com/facebook/react-native/blob/main/LICENSE"
          />

          <License
            name="React"
            version="18.3.1"
            license="MIT License"
            description="A JavaScript library for building user interfaces"
            url="https://github.com/facebook/react/blob/main/LICENSE"
          />

          <License
            name="Expo"
            version="52.0.0"
            license="MIT License"
            description="An open-source platform for making universal native apps"
            url="https://github.com/expo/expo/blob/main/LICENSE"
          />

          <License
            name="TypeScript"
            version="5.8.3"
            license="Apache License 2.0"
            description="A typed superset of JavaScript that compiles to plain JavaScript"
            url="https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backend & Cloud Services</Text>

          <License
            name="AWS Amplify"
            version="6.15.4"
            license="Apache License 2.0"
            description="A set of tools and services for building scalable mobile and web applications"
            url="https://github.com/aws-amplify/amplify-js/blob/main/LICENSE"
          />

          <License
            name="AWS CDK"
            version="2.138.0"
            license="Apache License 2.0"
            description="AWS Cloud Development Kit for defining cloud infrastructure"
            url="https://github.com/aws/aws-cdk/blob/main/LICENSE"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation & UI</Text>

          <License
            name="React Navigation"
            version="7.1.17"
            license="MIT License"
            description="Routing and navigation for React Native apps"
            url="https://github.com/react-navigation/react-navigation/blob/main/packages/core/LICENSE"
          />

          <License
            name="React Native Safe Area Context"
            version="4.12.0"
            license="MIT License"
            description="A flexible way to handle safe area insets in React Native"
            url="https://github.com/th3rdwave/react-native-safe-area-context/blob/main/LICENSE"
          />

          <License
            name="React Native Gesture Handler"
            version="2.20.2"
            license="MIT License"
            description="Declarative API exposing native platform touch and gesture system"
            url="https://github.com/software-mansion/react-native-gesture-handler/blob/main/LICENSE"
          />

          <License
            name="React Native SVG"
            version="15.8.0"
            license="MIT License"
            description="SVG library for React Native"
            url="https://github.com/software-mansion/react-native-svg/blob/main/LICENSE"
          />

          <License
            name="Expo Vector Icons"
            version="Included with Expo"
            license="MIT License"
            description="Built-in support for popular icon fonts and the tooling to create custom icon sets"
            url="https://github.com/expo/vector-icons/blob/master/LICENSE"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Utilities & Features</Text>

          <License
            name="Expo Notifications"
            version="0.29.14"
            license="MIT License"
            description="Provides an API to fetch push notification tokens and handle incoming notifications"
            url="https://github.com/expo/expo/blob/main/LICENSE"
          />

          <License
            name="Expo Image Picker"
            version="16.0.6"
            license="MIT License"
            description="Provides access to the system's UI for selecting images and videos"
            url="https://github.com/expo/expo/blob/main/LICENSE"
          />

          <License
            name="React Native Async Storage"
            version="1.23.1"
            license="MIT License"
            description="An asynchronous, persistent, key-value storage system for React Native"
            url="https://github.com/react-native-async-storage/async-storage/blob/main/LICENSE"
          />

          <License
            name="React Native Toast Message"
            version="2.3.3"
            license="MIT License"
            description="Animated toast message component for React Native"
            url="https://github.com/calintamas/react-native-toast-message/blob/main/LICENSE"
          />

          <License
            name="React Native QRCode SVG"
            version="6.3.15"
            license="MIT License"
            description="QR code generator for React Native"
            url="https://github.com/awesomejerry/react-native-qrcode-svg/blob/master/LICENSE"
          />

          <License
            name="libphonenumber-js"
            version="1.12.26"
            license="MIT License"
            description="A JavaScript port of Google's libphonenumber library"
            url="https://github.com/catamphetamine/libphonenumber-js/blob/master/LICENSE"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Development Tools</Text>

          <License
            name="ESLint"
            version="8.57.0"
            license="MIT License"
            description="A pluggable and configurable linter tool for identifying and reporting on patterns in JavaScript"
            url="https://github.com/eslint/eslint/blob/main/LICENSE"
          />

          <License
            name="Babel"
            version="7.20.0"
            license="MIT License"
            description="A JavaScript compiler that converts modern JavaScript into backwards compatible versions"
            url="https://github.com/babel/babel/blob/main/LICENSE"
          />
        </View>

        <View style={styles.licenseNotice}>
          <Text style={styles.noticeTitle}>License Information</Text>
          <Text style={styles.noticeText}>
            The MIT License and Apache License 2.0 are permissive open source licenses that allow for reuse with minimal restrictions. All dependencies listed above retain their original licenses and copyrights.
          </Text>
          <Text style={styles.noticeText}>
            For complete license texts and additional attributions, please visit the linked repositories above or contact us through the Support section.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you to all open source contributors!
          </Text>
          <Text style={[styles.footerText, { marginTop: spacing.sm }]}>
            © 2025 SideBet LLC. All rights reserved.
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  intro: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  section: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  licenseItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  licenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs / 2,
  },
  licenseName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  licenseVersion: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
  },
  licenseType: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: spacing.xs / 2,
  },
  licenseDescription: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs / 2,
  },
  linkButtonText: {
    ...textStyles.caption,
    color: colors.primary,
    marginRight: spacing.xs / 2,
  },
  licenseNotice: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  noticeTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  noticeText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  footerText: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
