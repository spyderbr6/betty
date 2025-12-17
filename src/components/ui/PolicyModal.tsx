/**
 * PolicyModal Component
 *
 * Displays Terms of Service or Privacy Policy in a modal overlay.
 * Used during signup to allow users to read policies before accepting.
 */

import React from 'react';
import { Modal } from 'react-native';
import { TermsOfServiceScreen } from '../../screens/TermsOfServiceScreen';
import { PrivacyPolicyScreen } from '../../screens/PrivacyPolicyScreen';

interface PolicyModalProps {
  visible: boolean;
  onClose: () => void;
  policyType: 'terms' | 'privacy';
}

export const PolicyModal: React.FC<PolicyModalProps> = ({
  visible,
  onClose,
  policyType,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {policyType === 'terms' ? (
        <TermsOfServiceScreen onClose={onClose} />
      ) : (
        <PrivacyPolicyScreen onClose={onClose} />
      )}
    </Modal>
  );
};
