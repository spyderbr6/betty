/**
 * Trust & Safety Screen
 * Security settings and account verification
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography, commonStyles } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { VerifyPhoneModal } from '../components/ui/VerifyPhoneModal';
import { PhoneInput } from '../components/ui/PhoneInput';
import { useAuth } from '../contexts/AuthContext';
import { updatePassword, setUpTOTP, verifyTOTPSetup, updateMFAPreference, fetchMFAPreference, fetchUserAttributes } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { sendVerificationCode, completePhoneVerification, changePhoneNumber } from '../services/phoneVerificationService';
import { formatDisplayPhone, formatPhoneNumber, validatePhoneNumber } from '../utils/phoneValidation';
import type { CountryCode } from 'libphonenumber-js';
import { showAlert } from '../components/ui/CustomAlert';

const client = generateClient<Schema>();

interface TrustSafetyScreenProps {
  onClose: () => void;
}

export const TrustSafetyScreen: React.FC<TrustSafetyScreenProps> = ({ onClose }) => {
  const { user } = useAuth();

  // Modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  // Phone states
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [isLoadingPhone, setIsLoadingPhone] = useState(false);

  // Check MFA status on mount
  useEffect(() => {
    checkMFAStatus();
    loadPhoneNumber();
  }, []);

  const checkMFAStatus = async () => {
    try {
      const mfaPreference = await fetchMFAPreference();
      setMfaEnabled(mfaPreference?.preferred === 'TOTP' || mfaPreference?.enabled?.includes('TOTP'));
    } catch (error) {
      console.error('Error checking MFA status:', error);
    }
  };

  const loadPhoneNumber = async () => {
    try {
      // First try to get phone from Cognito (authoritative source)
      const userAttributes = await fetchUserAttributes();
      const cognitoPhone = userAttributes.phone_number;
      const cognitoPhoneVerified = userAttributes.phone_number_verified === 'true';

      if (cognitoPhone) {
        setPhoneNumber(cognitoPhone);
        setPhoneVerified(cognitoPhoneVerified);

        // Update database to match Cognito
        if (user?.userId) {
          await client.models.User.update({
            id: user.userId,
            phoneNumber: cognitoPhone,
            phoneNumberVerified: cognitoPhoneVerified,
            phoneNumberVerifiedAt: cognitoPhoneVerified ? new Date().toISOString() : undefined,
          });
        }
      } else if (user?.userId) {
        // Fallback to database if Cognito doesn't have phone
        const { data: userData } = await client.models.User.get({ id: user.userId });
        if (userData?.phoneNumber) {
          setPhoneNumber(userData.phoneNumber);
          setPhoneVerified(userData.phoneNumberVerified || false);
        }
      }
    } catch (error) {
      console.error('Error loading phone number:', error);
    }
  };

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

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => setShowPasswordModal(true)}>
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

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => setShow2FAModal(true)}>
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: mfaEnabled ? colors.success + '20' : colors.warning + '20' }]}>
                <Ionicons name="finger-print-outline" size={22} color={mfaEnabled ? colors.success : colors.warning} />
              </View>
              <View style={styles.menuItemText}>
                <Text style={styles.menuItemTitle}>Two-Factor Authentication</Text>
                <Text style={styles.menuItemSubtitle}>{mfaEnabled ? 'Enabled' : 'Not enabled'}</Text>
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

          {/* Phone Verification Card */}
          <TouchableOpacity
            style={[
              styles.verificationCard,
              !phoneVerified && { backgroundColor: colors.warning + '10', borderColor: colors.warning + '30' }
            ]}
            activeOpacity={0.7}
            onPress={() => setShowPhoneModal(true)}
          >
            <View style={styles.verificationHeader}>
              <Ionicons
                name="phone-portrait"
                size={24}
                color={phoneVerified ? colors.success : colors.warning}
              />
              <Text style={[
                styles.verificationTitle,
                { color: phoneVerified ? colors.success : colors.warning }
              ]}>
                {phoneVerified ? 'Phone Verified' : 'Phone Not Verified'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
            </View>
            {phoneNumber && (
              <Text style={styles.verificationEmail}>
                {formatDisplayPhone(phoneNumber, 'national')}
              </Text>
            )}
            {!phoneVerified && (
              <Text style={styles.verificationSubtext}>Tap to verify your phone number</Text>
            )}
          </TouchableOpacity>
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

      {/* Change Password Modal */}
      <ChangePasswordModal
        visible={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />

      {/* Two-Factor Authentication Modal */}
      <TwoFactorAuthModal
        visible={show2FAModal}
        onClose={() => {
          setShow2FAModal(false);
          checkMFAStatus(); // Refresh MFA status when modal closes
        }}
        mfaEnabled={mfaEnabled}
      />

      {/* Phone Management Modal */}
      <PhoneManagementModal
        visible={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        phoneNumber={phoneNumber}
        phoneVerified={phoneVerified}
        onVerifyPress={() => {
          setShowPhoneModal(false);
          setShowPhoneVerifyModal(true);
        }}
        onVerifySuccess={async () => {
          await loadPhoneNumber();
        }}
      />

      {/* Verify Phone Modal */}
      <VerifyPhoneModal
        visible={showPhoneVerifyModal}
        onClose={() => setShowPhoneVerifyModal(false)}
        onSuccess={async () => {
          setShowPhoneVerifyModal(false);
          await loadPhoneNumber();
          showAlert('Success', 'Your phone number has been verified successfully!');
        }}
        phoneNumber={phoneNumber}
      />
    </SafeAreaView>
  );
};

// Phone Management Modal Component
interface PhoneManagementModalProps {
  visible: boolean;
  onClose: () => void;
  phoneNumber: string;
  phoneVerified: boolean;
  onVerifyPress: () => void;
  onVerifySuccess: () => void;
}

const PhoneManagementModal: React.FC<PhoneManagementModalProps> = ({
  visible,
  onClose,
  phoneNumber,
  phoneVerified,
  onVerifyPress,
  onVerifySuccess,
}) => {
  const [isChanging, setIsChanging] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [formattedNewPhone, setFormattedNewPhone] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('US');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const resetModal = () => {
    setIsChanging(false);
    setNewPhoneNumber('');
    setFormattedNewPhone('');
    setError('');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleVerifyExisting = async () => {
    if (!phoneNumber) {
      setError('No phone number to verify');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await sendVerificationCode(phoneNumber);

      if (result.success) {
        onVerifyPress();
      } else {
        setError(result.error || 'Failed to send verification code');
      }
    } catch (err: any) {
      console.error('Error sending verification code:', err);
      setError(err.message || 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePhone = async () => {
    setError('');

    // Validate phone number
    if (!validatePhoneNumber(newPhoneNumber, countryCode)) {
      setError('Please enter a valid phone number');
      return;
    }

    // Format phone number to E.164
    const formatted = formatPhoneNumber(newPhoneNumber, countryCode);
    if (!formatted) {
      setError('Failed to format phone number');
      return;
    }

    setIsLoading(true);

    try {
      const result = await changePhoneNumber(formatted, countryCode);

      if (result.success) {
        setFormattedNewPhone(formatted);
        onVerifyPress();
        resetModal();
      } else {
        setError(result.error || 'Failed to change phone number');
      }
    } catch (err: any) {
      console.error('Error changing phone number:', err);
      setError(err.message || 'Failed to change phone number');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={modalStyles.container} edges={['top']}>
        <ModalHeader title="Phone Number" onClose={handleClose} />

        <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.formSection}>
            {/* Current Phone Status */}
            {!isChanging && (
              <>
                <View style={modalStyles.infoCard}>
                  <Ionicons
                    name="phone-portrait"
                    size={48}
                    color={phoneVerified ? colors.success : colors.warning}
                  />
                  <Text style={modalStyles.infoTitle}>
                    {phoneVerified ? 'Phone Verified' : 'Phone Not Verified'}
                  </Text>
                  {phoneNumber ? (
                    <Text style={modalStyles.infoDescription}>
                      {formatDisplayPhone(phoneNumber, 'international')}
                    </Text>
                  ) : (
                    <Text style={modalStyles.infoDescription}>
                      No phone number on file
                    </Text>
                  )}
                </View>

                {/* Verify Button (if not verified) */}
                {!phoneVerified && phoneNumber && (
                  <>
                    <View style={modalStyles.benefitsSection}>
                      <Text style={modalStyles.benefitsTitle}>Why verify your phone?</Text>
                      <BenefitItem icon="shield-checkmark" text="Enhanced account security" />
                      <BenefitItem icon="people" text="Let friends find you by phone number" />
                      <BenefitItem icon="notifications" text="Enable SMS two-factor authentication" />
                    </View>

                    <TouchableOpacity
                      style={[modalStyles.primaryButton, isLoading && modalStyles.buttonDisabled]}
                      onPress={handleVerifyExisting}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={colors.textInverse} />
                      ) : (
                        <>
                          <Ionicons name="shield-checkmark" size={20} color={colors.textInverse} />
                          <Text style={modalStyles.primaryButtonText}>Verify Phone Number</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}

                {/* Change Phone Button */}
                <TouchableOpacity
                  style={[modalStyles.secondaryButton, { marginTop: spacing.lg }]}
                  onPress={() => setIsChanging(true)}
                >
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                  <Text style={modalStyles.secondaryButtonText}>Change Phone Number</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Change Phone Form */}
            {isChanging && (
              <>
                <Text style={modalStyles.description}>
                  Enter your new phone number. You'll need to verify it before it becomes active.
                </Text>

                <PhoneInput
                  value={newPhoneNumber}
                  onChangeText={setNewPhoneNumber}
                  onChangeFormattedText={setFormattedNewPhone}
                  onChangeCountryCode={setCountryCode}
                  label="New Phone Number"
                  placeholder="Enter new phone number"
                  required
                  disabled={isLoading}
                  defaultCountryCode={countryCode}
                  error={error}
                />

                <TouchableOpacity
                  style={[modalStyles.primaryButton, isLoading && modalStyles.buttonDisabled]}
                  onPress={handleChangePhone}
                  disabled={isLoading || !newPhoneNumber}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={modalStyles.primaryButtonText}>Send Verification Code</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={modalStyles.secondaryButton}
                  onPress={() => {
                    setIsChanging(false);
                    setNewPhoneNumber('');
                    setError('');
                  }}
                >
                  <Text style={modalStyles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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

// Change Password Modal Component
interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ visible, onClose }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const resetForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return null;
  };

  const handleChangePassword = async () => {
    setError('');

    // Validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      await updatePassword({ oldPassword, newPassword });
      showAlert(
        'Success',
        'Your password has been changed successfully.',
        [{ text: 'OK', onPress: handleClose }]
      );
    } catch (err: any) {
      console.error('Error changing password:', err);
      if (err.name === 'NotAuthorizedException') {
        setError('Current password is incorrect');
      } else if (err.name === 'InvalidPasswordException') {
        setError('New password does not meet requirements');
      } else if (err.name === 'LimitExceededException') {
        setError('Too many attempts. Please try again later');
      } else {
        setError(err.message || 'Failed to change password');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={modalStyles.container} edges={['top']}>
        <ModalHeader title="Change Password" onClose={handleClose} />

        <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.formSection}>
            <Text style={modalStyles.description}>
              Create a strong password with at least 8 characters, including uppercase, lowercase, numbers, and special characters.
            </Text>

            {/* Current Password */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Current Password</Text>
              <View style={modalStyles.passwordInputContainer}>
                <TextInput
                  style={modalStyles.passwordInput}
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  secureTextEntry={!showOldPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={modalStyles.passwordToggle}
                  onPress={() => setShowOldPassword(!showOldPassword)}
                >
                  <Ionicons
                    name={showOldPassword ? 'eye-off' : 'eye'}
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* New Password */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>New Password</Text>
              <View style={modalStyles.passwordInputContainer}>
                <TextInput
                  style={modalStyles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={modalStyles.passwordToggle}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  <Ionicons
                    name={showNewPassword ? 'eye-off' : 'eye'}
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.label}>Confirm New Password</Text>
              <View style={modalStyles.passwordInputContainer}>
                <TextInput
                  style={modalStyles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={modalStyles.passwordToggle}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off' : 'eye'}
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Error Message */}
            {error ? (
              <View style={modalStyles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color={colors.error} />
                <Text style={modalStyles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Change Password Button */}
            <TouchableOpacity
              style={[modalStyles.primaryButton, isLoading && modalStyles.buttonDisabled]}
              onPress={handleChangePassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={modalStyles.primaryButtonText}>Change Password</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Password Requirements */}
          <View style={modalStyles.requirementsSection}>
            <Text style={modalStyles.requirementsTitle}>Password Requirements:</Text>
            <RequirementItem text="At least 8 characters" met={newPassword.length >= 8} />
            <RequirementItem text="One uppercase letter" met={/[A-Z]/.test(newPassword)} />
            <RequirementItem text="One lowercase letter" met={/[a-z]/.test(newPassword)} />
            <RequirementItem text="One number" met={/[0-9]/.test(newPassword)} />
            <RequirementItem text="One special character" met={/[^A-Za-z0-9]/.test(newPassword)} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// Password Requirement Item Component
interface RequirementItemProps {
  text: string;
  met: boolean;
}

const RequirementItem: React.FC<RequirementItemProps> = ({ text, met }) => (
  <View style={modalStyles.requirementItem}>
    <Ionicons
      name={met ? 'checkmark-circle' : 'ellipse-outline'}
      size={18}
      color={met ? colors.success : colors.textMuted}
    />
    <Text style={[modalStyles.requirementText, met && modalStyles.requirementTextMet]}>
      {text}
    </Text>
  </View>
);

// Two-Factor Authentication Modal Component
interface TwoFactorAuthModalProps {
  visible: boolean;
  onClose: () => void;
  mfaEnabled: boolean;
}

const TwoFactorAuthModal: React.FC<TwoFactorAuthModalProps> = ({ visible, onClose, mfaEnabled }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupStep, setSetupStep] = useState<'initial' | 'setup' | 'verify'>('initial');
  const [totpCode, setTotpCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [qrCodeUri, setQrCodeUri] = useState('');

  const resetModal = () => {
    setSetupStep('initial');
    setTotpCode('');
    setVerificationCode('');
    setQrCodeUri('');
    setError('');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleSetupTOTP = async () => {
    setIsLoading(true);
    setError('');
    try {
      const totpSetupDetails = await setUpTOTP();
      const setupUri = totpSetupDetails.getSetupUri('SideBet');
      setQrCodeUri(setupUri.href);
      setTotpCode(totpSetupDetails.sharedSecret);
      setSetupStep('verify');
    } catch (err: any) {
      console.error('Error setting up TOTP:', err);
      setError(err.message || 'Failed to set up 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyTOTP = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await verifyTOTPSetup({ code: verificationCode });
      await updateMFAPreference({ totp: 'PREFERRED' });
      showAlert(
        'Success',
        'Two-factor authentication has been enabled successfully.',
        [{ text: 'OK', onPress: handleClose }]
      );
    } catch (err: any) {
      console.error('Error verifying TOTP:', err);
      if (err.name === 'CodeMismatchException') {
        setError('Invalid verification code. Please try again');
      } else {
        setError(err.message || 'Failed to verify code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable2FA = () => {
    showAlert(
      'Disable 2FA',
      'Are you sure you want to disable two-factor authentication? This will make your account less secure.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await updateMFAPreference({ totp: 'DISABLED' });
              showAlert('Success', '2FA has been disabled', [{ text: 'OK', onPress: handleClose }]);
            } catch (err: any) {
              console.error('Error disabling 2FA:', err);
              showAlert('Error', err.message || 'Failed to disable 2FA');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={modalStyles.container} edges={['top']}>
        <ModalHeader title="Two-Factor Authentication" onClose={handleClose} />

        <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>
          {setupStep === 'initial' && (
            <View style={modalStyles.formSection}>
              <View style={modalStyles.infoCard}>
                <Ionicons name="shield-checkmark" size={48} color={mfaEnabled ? colors.success : colors.primary} />
                <Text style={modalStyles.infoTitle}>
                  {mfaEnabled ? '2FA is Enabled' : 'Secure Your Account'}
                </Text>
                <Text style={modalStyles.infoDescription}>
                  {mfaEnabled
                    ? 'Your account is protected with two-factor authentication.'
                    : 'Add an extra layer of security by requiring a verification code from your authenticator app.'}
                </Text>
              </View>

              {!mfaEnabled && (
                <>
                  <View style={modalStyles.benefitsSection}>
                    <Text style={modalStyles.benefitsTitle}>Benefits of 2FA:</Text>
                    <BenefitItem icon="lock-closed" text="Protects against unauthorized access" />
                    <BenefitItem icon="shield" text="Secures your balance and bets" />
                    <BenefitItem icon="phone-portrait" text="Works with any authenticator app" />
                  </View>

                  <TouchableOpacity
                    style={[modalStyles.primaryButton, isLoading && modalStyles.buttonDisabled]}
                    onPress={handleSetupTOTP}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color={colors.textInverse} />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={20} color={colors.textInverse} />
                        <Text style={modalStyles.primaryButtonText}>Enable 2FA</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {mfaEnabled && (
                <TouchableOpacity
                  style={[modalStyles.dangerButton, isLoading && modalStyles.buttonDisabled]}
                  onPress={handleDisable2FA}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={20} color={colors.textInverse} />
                      <Text style={modalStyles.dangerButtonText}>Disable 2FA</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {setupStep === 'verify' && (
            <View style={modalStyles.formSection}>
              <View style={modalStyles.setupSection}>
                <Text style={modalStyles.stepTitle}>Step 1: Scan QR Code</Text>
                <Text style={modalStyles.stepDescription}>
                  Open your authenticator app (Google Authenticator, Authy, etc.) and scan this QR code:
                </Text>

                {/* QR Code Display */}
                <View style={modalStyles.qrCodeContainer}>
                  <Text style={modalStyles.qrCodeText}>QR Code:</Text>
                  <Text style={modalStyles.qrCodeUri} selectable>
                    {qrCodeUri}
                  </Text>
                  <Text style={modalStyles.qrCodeHelp}>
                    Copy this URI and convert it to a QR code, or manually enter the secret key below.
                  </Text>
                </View>

                {/* Manual Entry Code */}
                <View style={modalStyles.manualCodeContainer}>
                  <Text style={modalStyles.manualCodeLabel}>Or enter this code manually:</Text>
                  <View style={modalStyles.codeBox}>
                    <Text style={modalStyles.codeText} selectable>
                      {totpCode}
                    </Text>
                  </View>
                </View>

                <Text style={modalStyles.stepTitle}>Step 2: Enter Verification Code</Text>
                <Text style={modalStyles.stepDescription}>
                  Enter the 6-digit code from your authenticator app:
                </Text>

                <TextInput
                  style={modalStyles.verificationInput}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  placeholder="000000"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />

                {error ? (
                  <View style={modalStyles.errorContainer}>
                    <Ionicons name="alert-circle" size={20} color={colors.error} />
                    <Text style={modalStyles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[modalStyles.primaryButton, isLoading && modalStyles.buttonDisabled]}
                  onPress={handleVerifyTOTP}
                  disabled={isLoading || verificationCode.length !== 6}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={modalStyles.primaryButtonText}>Verify & Enable</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={modalStyles.secondaryButton} onPress={resetModal}>
                  <Text style={modalStyles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// Benefit Item Component
interface BenefitItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

const BenefitItem: React.FC<BenefitItemProps> = ({ icon, text }) => (
  <View style={modalStyles.benefitItem}>
    <Ionicons name={icon} size={20} color={colors.primary} />
    <Text style={modalStyles.benefitText}>{text}</Text>
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
  verificationSubtext: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
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

// Modal Styles
const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  formSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  description: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...textStyles.label,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    ...textStyles.body,
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  passwordToggle: {
    paddingHorizontal: spacing.md,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '15',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...textStyles.body,
    color: colors.error,
    marginLeft: spacing.sm,
    flex: 1,
  },
  primaryButton: {
    ...commonStyles.primaryButton,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    marginLeft: spacing.xs,
  },
  secondaryButton: {
    ...commonStyles.secondaryButton,
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    ...textStyles.button,
    color: colors.primary,
  },
  dangerButton: {
    backgroundColor: colors.error,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  dangerButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    marginLeft: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  requirementsSection: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  requirementsTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs / 2,
  },
  requirementText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  requirementTextMet: {
    color: colors.textSecondary,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  infoTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  infoDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  benefitsSection: {
    marginBottom: spacing.lg,
  },
  benefitsTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  benefitText: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  setupSection: {
    paddingTop: spacing.md,
  },
  stepTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  stepDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  qrCodeContainer: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  qrCodeText: {
    ...textStyles.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  qrCodeUri: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.mono,
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: spacing.radius.sm,
    marginBottom: spacing.sm,
  },
  qrCodeHelp: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  manualCodeContainer: {
    marginBottom: spacing.lg,
  },
  manualCodeLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  codeBox: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  codeText: {
    ...textStyles.h3,
    color: colors.primary,
    fontFamily: typography.fontFamily.mono,
    textAlign: 'center',
    letterSpacing: 4,
  },
  verificationInput: {
    ...textStyles.h2,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    textAlign: 'center',
    letterSpacing: 8,
    fontFamily: typography.fontFamily.mono,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
});
