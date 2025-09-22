/**
 * Notification Modal
 * Modal wrapper for the NotificationScreen
 */

import React from 'react';
import { Modal, StatusBar } from 'react-native';
import { NotificationScreen } from '../../screens/NotificationScreen';
import { colors } from '../../styles';

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  visible,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.surface}
      />
      <NotificationScreen onClose={onClose} />
    </Modal>
  );
};