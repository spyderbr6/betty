/**
 * Custom Toast Configuration
 * Snackbar-style toast notifications for in-app notifications
 */

import { View, Text, StyleSheet } from 'react-native';
import { BaseToast, ErrorToast, InfoToast } from 'react-native-toast-message';
import { colors, spacing, textStyles, typography, shadows } from '../../styles';

/**
 * Custom toast configuration for snackbar-style notifications
 */
export const toastConfig = {
  /*
    Success toast - Green background (HIGH priority)
  */
  success: (props: any) => (
    <BaseToast
      {...props}
      style={[styles.baseToast, styles.successToast]}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>✅</Text>
        </View>
      )}
      renderTrailingIcon={() => null}
    />
  ),

  /*
    Error toast - Red background (URGENT priority)
  */
  error: (props: any) => (
    <ErrorToast
      {...props}
      style={[styles.baseToast, styles.errorToast]}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>⚠️</Text>
        </View>
      )}
      renderTrailingIcon={() => null}
    />
  ),

  /*
    Info toast - Blue background (MEDIUM priority)
  */
  info: (props: any) => (
    <InfoToast
      {...props}
      style={[styles.baseToast, styles.infoToast]}
      contentContainerStyle={styles.contentContainer}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
      renderLeadingIcon={() => (
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>ℹ️</Text>
        </View>
      )}
      renderTrailingIcon={() => null}
    />
  ),
};

const styles = StyleSheet.create({
  baseToast: {
    borderLeftWidth: 0,
    borderRadius: spacing.radius.md,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadows.card,
    minHeight: 60,
    width: '90%',
  },
  successToast: {
    backgroundColor: colors.success,
    borderLeftColor: colors.success,
  },
  errorToast: {
    backgroundColor: colors.error,
    borderLeftColor: colors.error,
  },
  infoToast: {
    backgroundColor: colors.primary,
    borderLeftColor: colors.primary,
  },
  contentContainer: {
    paddingHorizontal: spacing.sm,
    flex: 1,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
    height: 32,
    marginLeft: spacing.xs,
  },
  iconText: {
    fontSize: 20,
  },
  text1: {
    ...textStyles.button,
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
  },
  text2: {
    ...textStyles.caption,
    color: colors.textInverse,
    fontSize: typography.fontSize.xs,
    opacity: 0.95,
  },
});
