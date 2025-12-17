/**
 * QR Scanner Modal Component
 * Allows users to scan QR codes to quickly join bets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraView, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../../styles';
import { ModalHeader } from './ModalHeader';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onBetScanned: (betId: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onBetScanned,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(true);

  useEffect(() => {
    if (visible) {
      requestCameraPermission();
    }
  }, [visible]);

  const requestCameraPermission = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setHasPermission(false);
    }
  };

  const handleBarCodeScanned = ({ data }: BarcodeScanningResult) => {
    if (!isScanning) return;

    setIsScanning(false);

    try {
      // Parse QR code data - expecting format: sidebet://bet/{betId}
      const betIdMatch = data.match(/sidebet:\/\/bet\/(.+)/);

      if (betIdMatch && betIdMatch[1]) {
        const betId = betIdMatch[1];
        onBetScanned(betId);
        onClose();
      } else {
        showAlert(
          'Invalid QR Code',
          'This QR code is not a valid SideBet invitation.',
          [
            {
              text: 'Scan Again',
              onPress: () => setIsScanning(true),
            },
            {
              text: 'Cancel',
              onPress: onClose,
              style: 'cancel',
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error parsing QR code:', error);
      showAlert(
        'Error',
        'Failed to process QR code. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => setIsScanning(true),
          },
        ]
      );
    }
  };

  if (hasPermission === null) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.container} edges={['top']}>
          <ModalHeader title="Scan QR Code" onClose={onClose} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Requesting camera permission...</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  if (hasPermission === false) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView style={styles.container} edges={['top']}>
          <ModalHeader title="Scan QR Code" onClose={onClose} />
          <View style={styles.permissionContainer}>
            <Ionicons name="camera-outline" size={64} color={colors.textMuted} />
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionText}>
              Please enable camera access in your device settings to scan QR codes.
            </Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={requestCameraPermission}
              activeOpacity={0.7}
            >
              <Text style={styles.settingsButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Scan QR Code" onClose={onClose} />

        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={isScanning ? handleBarCodeScanned : undefined}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          />

          {/* Scanning Frame Overlay */}
          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsText}>
              Position the QR code within the frame
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  permissionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  permissionText: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  settingsButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
  },
  settingsButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: colors.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructionsContainer: {
    position: 'absolute',
    bottom: spacing.xl * 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionsText: {
    ...textStyles.body,
    color: colors.background,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    overflow: 'hidden',
  },
});
