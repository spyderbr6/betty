/**
 * Custom Toast Configuration
 * Snackbar-style toast notifications for in-app notifications
 *
 * Design: Dark surface background with colored left accent border
 * - Matches app dark theme for visual consistency
 * - White text for optimal readability
 * - Auto-expanding height based on content
 */

import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, shadows } from '../../styles';

/**
 * Custom Toast Component
 * Fully custom implementation for flexible content sizing
 */
interface CustomToastProps {
  text1?: string;
  text2?: string;
  props?: any;
}

const CustomToast = ({
  text1,
  text2,
  accentColor,
  iconText,
}: CustomToastProps & { accentColor: string; iconText: string }) => (
  <View style={[styles.toastContainer, { borderLeftColor: accentColor }]}>
    <View style={[styles.iconContainer, { backgroundColor: accentColor }]}>
      <Text style={styles.iconText}>{iconText}</Text>
    </View>
    <View style={styles.contentContainer}>
      {text1 ? <Text style={styles.title} numberOfLines={2}>{text1}</Text> : null}
      {text2 ? <Text style={styles.message} numberOfLines={4}>{text2}</Text> : null}
    </View>
  </View>
);

/**
 * Custom toast configuration for snackbar-style notifications
 */
export const toastConfig = {
  /*
    Success toast - Green accent (HIGH priority)
  */
  success: ({ text1, text2, ...props }: any) => (
    <CustomToast
      text1={text1}
      text2={text2}
      accentColor={colors.success}
      iconText="✓"
      props={props}
    />
  ),

  /*
    Error toast - Red accent (URGENT priority)
  */
  error: ({ text1, text2, ...props }: any) => (
    <CustomToast
      text1={text1}
      text2={text2}
      accentColor={colors.error}
      iconText="!"
      props={props}
    />
  ),

  /*
    Info toast - Primary/Yellow accent (MEDIUM priority)
  */
  info: ({ text1, text2, ...props }: any) => (
    <CustomToast
      text1={text1}
      text2={text2}
      accentColor={colors.primary}
      iconText="i"
      props={props}
    />
  ),
};

const styles = StyleSheet.create({
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    borderLeftWidth: 4,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 68,
    maxWidth: '92%',
    alignSelf: 'center',
    ...shadows.lg,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: spacing.md,
  },
  iconText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    color: colors.textPrimary,
    marginBottom: spacing.xs / 2,
    lineHeight: typography.fontSize.base * 1.3,
  },
  message: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.normal,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * 1.4,
  },
});
