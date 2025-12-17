/**
 * Phone Number Validation Utilities
 * Handles phone number formatting, validation, and parsing using E.164 standard
 */

import { parsePhoneNumber as libParsePhoneNumber, CountryCode, isValidPhoneNumber as libIsValidPhoneNumber } from 'libphonenumber-js';

/**
 * Format phone number to E.164 international format (+1234567890)
 * This is the format stored in the database
 * @param phoneNumber - Phone number in any format
 * @param countryCode - Country code (default: 'US')
 * @returns Formatted phone number in E.164 format or null if invalid
 */
export const formatPhoneNumber = (phoneNumber: string, countryCode: CountryCode = 'US'): string | null => {
  try {
    // Remove all non-numeric characters for parsing
    const cleaned = phoneNumber.replace(/\D/g, '');

    if (!cleaned) {
      return null;
    }

    // Parse the phone number with country code
    const parsed = libParsePhoneNumber(cleaned, countryCode);

    if (!parsed || !parsed.isValid()) {
      return null;
    }

    // Return in E.164 format (+1234567890)
    return parsed.format('E.164');
  } catch (error) {
    console.error('[PhoneValidation] Error formatting phone number:', error);
    return null;
  }
};

/**
 * Validate if phone number is valid for a given country
 * @param phoneNumber - Phone number to validate
 * @param countryCode - Country code (default: 'US')
 * @returns True if valid, false otherwise
 */
export const validatePhoneNumber = (phoneNumber: string, countryCode: CountryCode = 'US'): boolean => {
  try {
    if (!phoneNumber) {
      return false;
    }

    // If phone number is already in E.164 format, validate directly
    if (phoneNumber.startsWith('+')) {
      return libIsValidPhoneNumber(phoneNumber);
    }

    // Otherwise parse with country code
    return libIsValidPhoneNumber(phoneNumber, countryCode);
  } catch (error) {
    console.error('[PhoneValidation] Error validating phone number:', error);
    return false;
  }
};

/**
 * Parse phone number and extract components
 * @param phoneNumber - Phone number to parse
 * @param countryCode - Country code (default: 'US')
 * @returns Parsed phone number object or null if invalid
 */
export const parsePhoneNumber = (phoneNumber: string, countryCode: CountryCode = 'US') => {
  try {
    if (!phoneNumber) {
      return null;
    }

    const parsed = libParsePhoneNumber(phoneNumber, countryCode);

    if (!parsed) {
      return null;
    }

    return {
      isValid: parsed.isValid(),
      countryCode: parsed.country,
      countryCallingCode: parsed.countryCallingCode,
      nationalNumber: parsed.nationalNumber,
      formatted: {
        e164: parsed.format('E.164'),           // +1234567890
        international: parsed.format('INTERNATIONAL'), // +1 234 567 8900
        national: parsed.format('NATIONAL'),     // (234) 567-8900
        uri: parsed.format('RFC3966'),           // tel:+1-234-567-8900
      }
    };
  } catch (error) {
    console.error('[PhoneValidation] Error parsing phone number:', error);
    return null;
  }
};

/**
 * Format phone number for display (user-friendly format)
 * @param phoneNumber - Phone number in E.164 format
 * @param format - Display format ('international' | 'national')
 * @returns Formatted phone number for display
 */
export const formatDisplayPhone = (phoneNumber: string, format: 'international' | 'national' = 'international'): string => {
  try {
    if (!phoneNumber) {
      return '';
    }

    const parsed = libParsePhoneNumber(phoneNumber);

    if (!parsed) {
      return phoneNumber; // Return original if can't parse
    }

    if (format === 'national') {
      return parsed.formatNational(); // (234) 567-8900
    }

    return parsed.formatInternational(); // +1 234 567 8900
  } catch (error) {
    console.error('[PhoneValidation] Error formatting display phone:', error);
    return phoneNumber;
  }
};

/**
 * Get country code from E.164 formatted phone number
 * @param phoneNumber - Phone number in E.164 format
 * @returns Country code or null if invalid
 */
export const getCountryCodeFromPhone = (phoneNumber: string): CountryCode | null => {
  try {
    if (!phoneNumber) {
      return null;
    }

    const parsed = libParsePhoneNumber(phoneNumber);
    return parsed?.country || null;
  } catch (error) {
    console.error('[PhoneValidation] Error getting country code:', error);
    return null;
  }
};

/**
 * Check if two phone numbers are the same (normalized comparison)
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns True if phone numbers are the same
 */
export const arePhoneNumbersEqual = (phone1: string, phone2: string): boolean => {
  try {
    const formatted1 = formatPhoneNumber(phone1);
    const formatted2 = formatPhoneNumber(phone2);

    if (!formatted1 || !formatted2) {
      return false;
    }

    return formatted1 === formatted2;
  } catch (error) {
    console.error('[PhoneValidation] Error comparing phone numbers:', error);
    return false;
  }
};

/**
 * Validate phone number and return error message if invalid
 * @param phoneNumber - Phone number to validate
 * @param countryCode - Country code (default: 'US')
 * @returns Error message or null if valid
 */
export const validatePhoneNumberWithError = (phoneNumber: string, countryCode: CountryCode = 'US'): string | null => {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return 'Phone number is required';
  }

  const cleaned = phoneNumber.replace(/\D/g, '');

  if (cleaned.length < 10) {
    return 'Phone number is too short';
  }

  if (cleaned.length > 15) {
    return 'Phone number is too long';
  }

  if (!validatePhoneNumber(phoneNumber, countryCode)) {
    return 'Phone number is invalid';
  }

  return null;
};

/**
 * Mask phone number for privacy (show last 4 digits)
 * @param phoneNumber - Phone number to mask
 * @returns Masked phone number (e.g., "+1 *** *** 1234")
 */
export const maskPhoneNumber = (phoneNumber: string): string => {
  try {
    if (!phoneNumber) {
      return '';
    }

    const parsed = libParsePhoneNumber(phoneNumber);

    if (!parsed) {
      // Fallback masking
      const cleaned = phoneNumber.replace(/\D/g, '');
      if (cleaned.length < 4) {
        return phoneNumber;
      }
      return `+*** *** ${cleaned.slice(-4)}`;
    }

    const formatted = parsed.formatInternational();
    const parts = formatted.split(' ');

    if (parts.length < 2) {
      return phoneNumber;
    }

    // Keep country code and last 4 digits, mask the rest
    const countryCode = parts[0];
    const lastPart = parts[parts.length - 1];
    const maskedMiddle = parts.slice(1, -1).map(() => '***').join(' ');

    return `${countryCode} ${maskedMiddle} ${lastPart}`.trim();
  } catch (error) {
    console.error('[PhoneValidation] Error masking phone number:', error);
    return phoneNumber;
  }
};
