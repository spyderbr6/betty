/**
 * Phone Verification Service
 * Handles phone number verification via AWS Cognito SMS
 */

import { updateUserAttribute, confirmUserAttribute, sendUserAttributeVerificationCode } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { formatPhoneNumber, validatePhoneNumber } from '../utils/phoneValidation';
import type { CountryCode } from 'libphonenumber-js';

const client = generateClient<Schema>();

export interface PhoneVerificationResult {
  success: boolean;
  error?: string;
}

export interface SendCodeResult {
  success: boolean;
  error?: string;
  destination?: string; // Masked phone number where code was sent
}

/**
 * Send SMS verification code to phone number
 * Uses AWS Cognito to send verification code via SMS
 * @param phoneNumber - Phone number in any format
 * @param countryCode - Country code (default: 'US')
 * @returns Result with success status and error message if failed
 */
export const sendVerificationCode = async (
  phoneNumber: string,
  countryCode: CountryCode = 'US'
): Promise<SendCodeResult> => {
  try {
    console.log('[PhoneVerification] Sending verification code to:', phoneNumber);

    // Validate and format phone number
    if (!validatePhoneNumber(phoneNumber, countryCode)) {
      console.error('[PhoneVerification] Invalid phone number');
      return {
        success: false,
        error: 'Invalid phone number format',
      };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber, countryCode);
    if (!formattedPhone) {
      console.error('[PhoneVerification] Failed to format phone number');
      return {
        success: false,
        error: 'Failed to format phone number',
      };
    }

    // Update phone number attribute in Cognito
    // This will automatically trigger SMS verification code
    await updateUserAttribute({
      userAttribute: {
        attributeKey: 'phone_number',
        value: formattedPhone,
      },
    });

    // Get the destination where code was sent (masked)
    const destination = maskPhone(formattedPhone);

    console.log('[PhoneVerification] Verification code sent successfully to:', destination);

    return {
      success: true,
      destination,
    };
  } catch (error) {
    console.error('[PhoneVerification] Error sending verification code:', error);
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to send verification code',
    };
  }
};

/**
 * Resend verification code to the phone number
 * @returns Result with success status and error message if failed
 */
export const resendVerificationCode = async (): Promise<SendCodeResult> => {
  try {
    console.log('[PhoneVerification] Resending verification code');

    // Resend code for phone_number attribute
    const result = await sendUserAttributeVerificationCode({
      userAttributeKey: 'phone_number',
    });

    const destination = result.destination;

    console.log('[PhoneVerification] Verification code resent successfully to:', destination);

    return {
      success: true,
      destination,
    };
  } catch (error) {
    console.error('[PhoneVerification] Error resending verification code:', error);
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to resend verification code',
    };
  }
};

/**
 * Verify the SMS code sent to phone number
 * @param code - 6-digit verification code from SMS
 * @returns Result with success status and error message if failed
 */
export const verifyCode = async (code: string): Promise<PhoneVerificationResult> => {
  try {
    console.log('[PhoneVerification] Verifying code');

    if (!code || code.trim().length !== 6) {
      console.error('[PhoneVerification] Invalid code format');
      return {
        success: false,
        error: 'Verification code must be 6 digits',
      };
    }

    // Verify the code with Cognito
    await confirmUserAttribute({
      userAttributeKey: 'phone_number',
      confirmationCode: code.trim(),
    });

    console.log('[PhoneVerification] Code verified successfully');

    return {
      success: true,
    };
  } catch (error) {
    console.error('[PhoneVerification] Error verifying code:', error);
    const err = error as Error;

    // Map common errors to user-friendly messages
    let errorMessage = err.message || 'Verification failed';

    if (err.message?.includes('CodeMismatchException') || err.message?.includes('Invalid code')) {
      errorMessage = 'Invalid verification code. Please try again.';
    } else if (err.message?.includes('ExpiredCodeException') || err.message?.includes('expired')) {
      errorMessage = 'Verification code has expired. Please request a new code.';
    } else if (err.message?.includes('LimitExceededException')) {
      errorMessage = 'Too many attempts. Please try again later.';
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Update user's phone number in database after verification
 * Should be called after successful code verification
 * @param userId - User ID
 * @param phoneNumber - Verified phone number in E.164 format
 * @returns Result with success status and error message if failed
 */
export const updateUserPhoneNumber = async (
  userId: string,
  phoneNumber: string
): Promise<PhoneVerificationResult> => {
  try {
    console.log('[PhoneVerification] Updating user phone number in database:', userId);

    // Update user record in database
    const result = await client.models.User.update({
      id: userId,
      phoneNumber: phoneNumber,
      phoneNumberVerified: true,
      phoneNumberVerifiedAt: new Date().toISOString(),
    });

    if (!result.data) {
      console.error('[PhoneVerification] Failed to update user phone number');
      return {
        success: false,
        error: 'Failed to update phone number',
      };
    }

    console.log('[PhoneVerification] User phone number updated successfully');

    return {
      success: true,
    };
  } catch (error) {
    console.error('[PhoneVerification] Error updating user phone number:', error);
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to update phone number',
    };
  }
};

/**
 * Complete phone verification flow
 * Sends code, verifies it, and updates database
 * @param userId - User ID
 * @param phoneNumber - Phone number to verify
 * @param countryCode - Country code (default: 'US')
 * @returns Result with success status and error message if failed
 */
export const initiatePhoneVerification = async (
  phoneNumber: string,
  countryCode: CountryCode = 'US'
): Promise<SendCodeResult> => {
  try {
    console.log('[PhoneVerification] Initiating phone verification');

    // Send verification code
    const sendResult = await sendVerificationCode(phoneNumber, countryCode);

    if (!sendResult.success) {
      return sendResult;
    }

    return sendResult;
  } catch (error) {
    console.error('[PhoneVerification] Error initiating phone verification:', error);
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to initiate phone verification',
    };
  }
};

/**
 * Complete verification after code is entered
 * @param userId - User ID
 * @param code - 6-digit verification code
 * @param phoneNumber - Phone number being verified (E.164 format)
 * @returns Result with success status and error message if failed
 */
export const completePhoneVerification = async (
  userId: string,
  code: string,
  phoneNumber: string
): Promise<PhoneVerificationResult> => {
  try {
    console.log('[PhoneVerification] Completing phone verification');

    // Verify the code
    const verifyResult = await verifyCode(code);

    if (!verifyResult.success) {
      return verifyResult;
    }

    // Update database with verified phone number
    const updateResult = await updateUserPhoneNumber(userId, phoneNumber);

    if (!updateResult.success) {
      return updateResult;
    }

    console.log('[PhoneVerification] Phone verification completed successfully');

    return {
      success: true,
    };
  } catch (error) {
    console.error('[PhoneVerification] Error completing phone verification:', error);
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to complete phone verification',
    };
  }
};

/**
 * Change phone number (for already verified users)
 * @param userId - User ID
 * @param newPhoneNumber - New phone number
 * @param countryCode - Country code (default: 'US')
 * @returns Result with success status and error message if failed
 */
export const changePhoneNumber = async (
  newPhoneNumber: string,
  countryCode: CountryCode = 'US'
): Promise<SendCodeResult> => {
  try {
    console.log('[PhoneVerification] Changing phone number');

    // Send verification code to new number
    const sendResult = await sendVerificationCode(newPhoneNumber, countryCode);

    if (!sendResult.success) {
      return sendResult;
    }

    return sendResult;
  } catch (error) {
    console.error('[PhoneVerification] Error changing phone number:', error);
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to change phone number',
    };
  }
};

/**
 * Remove phone number from user account
 * @param userId - User ID
 * @returns Result with success status and error message if failed
 */
export const removePhoneNumber = async (userId: string): Promise<PhoneVerificationResult> => {
  try {
    console.log('[PhoneVerification] Removing phone number:', userId);

    // Note: Since phone is required, this function should not be used in current design
    // Keeping it here for completeness but it should be disabled in UI

    // Update user record in database
    const result = await client.models.User.update({
      id: userId,
      phoneNumber: undefined,
      phoneNumberVerified: false,
      phoneNumberVerifiedAt: undefined,
    });

    if (!result.data) {
      console.error('[PhoneVerification] Failed to remove phone number');
      return {
        success: false,
        error: 'Failed to remove phone number',
      };
    }

    console.log('[PhoneVerification] Phone number removed successfully');

    return {
      success: true,
    };
  } catch (error) {
    console.error('[PhoneVerification] Error removing phone number:', error);
    const err = error as Error;
    return {
      success: false,
      error: err.message || 'Failed to remove phone number',
    };
  }
};

/**
 * Helper function to mask phone number for display
 * @param phoneNumber - Phone number in E.164 format
 * @returns Masked phone number
 */
const maskPhone = (phoneNumber: string): string => {
  if (!phoneNumber) {
    return '';
  }

  // Show only last 4 digits
  // +1234567890 -> +***-***-7890
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 4) {
    return phoneNumber;
  }

  const last4 = digits.slice(-4);
  return `+***-***-${last4}`;
};

/**
 * Check if user has verified phone number
 * @param userId - User ID
 * @returns True if user has verified phone number
 */
export const hasVerifiedPhoneNumber = async (userId: string): Promise<boolean> => {
  try {
    const { data: user } = await client.models.User.get({ id: userId });

    if (!user) {
      return false;
    }

    return Boolean(user.phoneNumber && user.phoneNumberVerified);
  } catch (error) {
    console.error('[PhoneVerification] Error checking verified phone number:', error);
    return false;
  }
};
