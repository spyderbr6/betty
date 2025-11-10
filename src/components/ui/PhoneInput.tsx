/**
 * Phone Input Component
 * Simple US phone number input with formatting
 *
 * Note: Currently US-only. Stores phone numbers in E.164 format (+1XXXXXXXXXX)
 * for future international expansion. Country selector can be added later.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import { parsePhoneNumber, AsYouType } from 'libphonenumber-js';
import { colors, spacing, typography, textStyles } from '../../styles';
import { validatePhoneNumberWithError } from '../../utils/phoneValidation';
import type { CountryCode } from 'libphonenumber-js';

interface PhoneInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onChangeFormattedText?: (text: string) => void;
  onChangeCountryCode?: (countryCode: CountryCode) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  defaultCountryCode?: CountryCode;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChangeText,
  onChangeFormattedText,
  onChangeCountryCode,
  label,
  error,
  placeholder = '(555) 555-1234',
  disabled = false,
  required = false,
  autoFocus = false,
  defaultCountryCode = 'US',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [internalError, setInternalError] = useState<string>('');
  const [displayValue, setDisplayValue] = useState<string>('');

  // Display error from props or internal validation
  const displayError = error || internalError;

  // Format phone number as user types
  const formatPhoneNumber = (text: string): string => {
    // Remove all non-digit characters
    const digits = text.replace(/\D/g, '');

    // Use libphonenumber-js formatter for US numbers
    const formatter = new AsYouType('US');
    const formatted = formatter.input(digits);

    return formatted;
  };

  // Convert display format to E.164 format for storage
  const toE164Format = (text: string): string => {
    const digits = text.replace(/\D/g, '');
    if (!digits) return '';

    // Add +1 prefix for US numbers
    return `+1${digits}`;
  };

  const handleChangeText = (text: string) => {
    // Format for display
    const formatted = formatPhoneNumber(text);
    setDisplayValue(formatted);

    // Convert to E.164 for storage
    const e164 = toE164Format(text);
    onChangeText(e164);

    // Optional: call formatted text callback
    if (onChangeFormattedText) {
      onChangeFormattedText(formatted);
    }

    // Clear error when user starts typing
    if (internalError) {
      setInternalError('');
    }
  };

  const validateInput = () => {
    if (!value) {
      if (required) {
        setInternalError('Phone number is required');
      }
      return;
    }

    const validationError = validatePhoneNumberWithError(value, defaultCountryCode);
    if (validationError) {
      setInternalError(validationError);
    }
  };

  // Check if phone number is valid
  const isValid = (): boolean => {
    if (!value) return false;
    try {
      const phoneNumber = parsePhoneNumber(value, defaultCountryCode);
      return phoneNumber?.isValid() || false;
    } catch {
      return false;
    }
  };

  // Update display value when value prop changes (e.g., from parent)
  React.useEffect(() => {
    if (value) {
      try {
        const phoneNumber = parsePhoneNumber(value, defaultCountryCode);
        if (phoneNumber) {
          setDisplayValue(phoneNumber.formatNational());
        } else {
          setDisplayValue(value);
        }
      } catch {
        setDisplayValue(value);
      }
    } else {
      setDisplayValue('');
    }
  }, [value, defaultCountryCode]);

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      <View style={[
        styles.inputContainer,
        isFocused && styles.inputContainerFocused,
        displayError && styles.inputContainerError,
        disabled && styles.inputContainerDisabled,
      ]}>
        <View style={styles.prefixContainer}>
          <Text style={styles.prefixText}>🇺🇸 +1</Text>
        </View>
        <TextInput
          style={[
            styles.textInput,
            disabled && styles.textInputDisabled,
          ]}
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            validateInput();
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          editable={!disabled}
          autoFocus={autoFocus}
          maxLength={14} // (XXX) XXX-XXXX format
          textAlignVertical="center"
        />
      </View>

      {displayError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{displayError}</Text>
        </View>
      )}

      {!displayError && value && isValid() && (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>✓ Valid phone number</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...textStyles.label,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  required: {
    color: colors.error,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  inputContainerFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  inputContainerError: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  inputContainerDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.6,
  },
  prefixContainer: {
    paddingRight: spacing.xs,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    marginRight: spacing.sm,
  },
  prefixText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  textInput: {
    ...textStyles.body,
    flex: 1,
    color: colors.textPrimary,
    height: Platform.OS === 'android' ? 48 : 44,
    paddingVertical: spacing.sm,
    includeFontPadding: false,
  },
  textInputDisabled: {
    color: colors.textMuted,
  },
  errorContainer: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    ...textStyles.caption,
    color: colors.error,
  },
  successContainer: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  successText: {
    ...textStyles.caption,
    color: colors.success,
  },
});
