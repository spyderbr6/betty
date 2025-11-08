/**
 * Phone Input Component
 * Reusable phone number input with international formatting and country selection
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import PhoneNumberInput from 'react-native-phone-number-input';
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
  placeholder = 'Phone number',
  disabled = false,
  required = false,
  autoFocus = false,
  defaultCountryCode = 'US',
}) => {
  const phoneInput = useRef<PhoneNumberInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [internalError, setInternalError] = useState<string>('');

  // Display error from props or internal validation
  const displayError = error || internalError;

  const handleChangeText = (text: string) => {
    onChangeText(text);

    // Clear error when user starts typing
    if (internalError) {
      setInternalError('');
    }
  };

  const handleChangeFormattedText = (formatted: string) => {
    if (onChangeFormattedText) {
      onChangeFormattedText(formatted);
    }
  };

  const handleCountryChange = (countryCode: CountryCode) => {
    if (onChangeCountryCode) {
      onChangeCountryCode(countryCode);
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
        <PhoneNumberInput
          ref={phoneInput}
          defaultValue={value}
          defaultCode={defaultCountryCode}
          layout="first"
          onChangeText={handleChangeText}
          onChangeFormattedText={handleChangeFormattedText}
          onChangeCountry={(country) => {
            handleCountryChange(country.cca2 as CountryCode);
          }}
          placeholder={placeholder}
          containerStyle={styles.phoneContainer}
          textContainerStyle={styles.textContainer}
          textInputStyle={styles.textInput}
          codeTextStyle={styles.codeText}
          countryPickerButtonStyle={styles.countryPicker}
          flagButtonStyle={styles.flagButton}
          disabled={disabled}
          autoFocus={autoFocus}
          withDarkTheme={false}
          withShadow={false}
          textInputProps={{
            onFocus: () => setIsFocused(true),
            onBlur: () => {
              setIsFocused(false);
              validateInput();
            },
            placeholderTextColor: colors.textMuted,
            keyboardType: 'phone-pad',
            editable: !disabled,
            style: {
              color: disabled ? colors.textMuted : colors.textPrimary,
            },
          }}
        />
      </View>

      {displayError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{displayError}</Text>
        </View>
      )}

      {!displayError && value && phoneInput.current?.isValidNumber(value) && (
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
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
  phoneContainer: {
    width: '100%',
    backgroundColor: 'transparent',
    paddingVertical: Platform.OS === 'android' ? spacing.xs : spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  textContainer: {
    backgroundColor: 'transparent',
    paddingVertical: 0,
  },
  textInput: {
    ...textStyles.body,
    color: colors.textPrimary,
    height: Platform.OS === 'android' ? 40 : 36,
    paddingVertical: 0,
    includeFontPadding: false, // Android-specific
  },
  codeText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    height: Platform.OS === 'android' ? 40 : 36,
    paddingTop: Platform.OS === 'android' ? 8 : 0,
  },
  countryPicker: {
    backgroundColor: 'transparent',
    paddingRight: spacing.xs,
  },
  flagButton: {
    backgroundColor: 'transparent',
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
