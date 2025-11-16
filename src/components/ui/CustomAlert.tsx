/**
 * CustomAlert Component
 * Cross-platform alert dialog that works on iOS, Android, and Web
 * Replaces React Native's Alert.alert() which doesn't work properly on web
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, textStyles } from '../../styles';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
}

// Global alert state management
let globalAlertController: {
  show: (title: string, message?: string, buttons?: AlertButton[]) => void;
  hide: () => void;
} | null = null;

export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  buttons = [{ text: 'OK', style: 'default' }],
  onDismiss,
}) => {
  const handleButtonPress = (button: AlertButton) => {
    // Dismiss modal first for immediate UI feedback
    onDismiss?.();

    // Then call the button callback (use setTimeout to ensure modal closes first)
    if (button.onPress) {
      setTimeout(() => {
        button.onPress?.();
      }, 100);
    }
  };

  const handleBackdropPress = () => {
    // Only dismiss if there's a cancel button
    const cancelButton = buttons.find(btn => btn.style === 'cancel');
    if (cancelButton) {
      handleButtonPress(cancelButton);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleBackdropPress}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleBackdropPress}
      >
        <View style={styles.alertContainer}>
          <View style={styles.alertContent}>
            {/* Title */}
            <Text style={styles.title}>{title}</Text>

            {/* Message */}
            {message && <Text style={styles.message}>{message}</Text>}

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {buttons.map((button, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    button.style === 'destructive' && styles.buttonDestructive,
                    button.style === 'cancel' && styles.buttonCancel,
                    buttons.length === 1 && styles.buttonSingle,
                    buttons.length === 2 && index === 0 && styles.buttonLeft,
                    buttons.length === 2 && index === 1 && styles.buttonRight,
                  ]}
                  onPress={() => handleButtonPress(button)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      button.style === 'destructive' && styles.buttonTextDestructive,
                      button.style === 'cancel' && styles.buttonTextCancel,
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// Global Alert Controller Component
export const CustomAlertController: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [buttons, setButtons] = useState<AlertButton[]>([{ text: 'OK' }]);

  useEffect(() => {
    globalAlertController = {
      show: (newTitle: string, newMessage?: string, newButtons?: AlertButton[]) => {
        setTitle(newTitle);
        setMessage(newMessage);
        setButtons(newButtons || [{ text: 'OK', style: 'default' }]);
        setVisible(true);
      },
      hide: () => {
        setVisible(false);
      },
    };

    return () => {
      globalAlertController = null;
    };
  }, []);

  const handleDismiss = () => {
    setVisible(false);
  };

  return (
    <CustomAlert
      visible={visible}
      title={title}
      message={message}
      buttons={buttons}
      onDismiss={handleDismiss}
    />
  );
};

// Static method to show alerts (similar to Alert.alert API)
export const showAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[]
) => {
  if (globalAlertController) {
    globalAlertController.show(title, message, buttons);
  } else {
    console.error('CustomAlertController not mounted. Add <CustomAlertController /> to your app root.');
  }
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 340,
  },
  alertContent: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Title and Message
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  // Button Container
  buttonContainer: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },

  // Buttons
  button: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonSingle: {
    marginHorizontal: 0,
  },
  buttonLeft: {
    marginRight: spacing.xs,
  },
  buttonRight: {
    marginLeft: spacing.xs,
  },
  buttonCancel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDestructive: {
    backgroundColor: colors.error,
  },

  // Button Text
  buttonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  buttonTextCancel: {
    color: colors.textSecondary,
  },
  buttonTextDestructive: {
    color: colors.background,
  },
});
