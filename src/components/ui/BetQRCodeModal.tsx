/**
 * Bet QR Code Modal Component
 * Displays a QR code for quick bet joining
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Share,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, textStyles, typography } from '../../styles';
import { ModalHeader } from './ModalHeader';
import { Bet } from '../../types/betting';

interface BetQRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  bet: Bet;
}

export const BetQRCodeModal: React.FC<BetQRCodeModalProps> = ({
  visible,
  onClose,
  bet,
}) => {
  // Generate QR code data with bet ID
  const qrCodeData = `sidebet://bet/${bet.id}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join my bet "${bet.title}" on SideBet!\n\nScan this QR code or use this link: ${qrCodeData}`,
        title: 'Share Bet Invitation',
      });
    } catch (error) {
      console.error('Error sharing QR code:', error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader
          title="Share Bet"
          onClose={onClose}
          rightComponent={
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          }
        />

        <View style={styles.content}>
          {/* Bet Info */}
          <View style={styles.betInfo}>
            <Text style={styles.betTitle} numberOfLines={2}>
              {bet.title}
            </Text>
            <Text style={styles.betDescription} numberOfLines={3}>
              {bet.description}
            </Text>
          </View>

          {/* QR Code */}
          <View style={styles.qrContainer}>
            <View style={styles.qrCodeWrapper}>
              <QRCode
                value={qrCodeData}
                size={220}
                color={colors.textPrimary}
                backgroundColor={colors.background}
              />
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <View style={styles.instructionRow}>
              <View style={styles.instructionIcon}>
                <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.instructionText}>
                <Text style={styles.instructionTitle}>Scan to Join</Text>
                <Text style={styles.instructionDescription}>
                  Friends can scan this code to instantly join your bet
                </Text>
              </View>
            </View>

            <View style={styles.instructionRow}>
              <View style={styles.instructionIcon}>
                <Ionicons name="share-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.instructionText}>
                <Text style={styles.instructionTitle}>Share Link</Text>
                <Text style={styles.instructionDescription}>
                  Tap the share icon to send via message or social media
                </Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Ionicons name="share-outline" size={20} color={colors.background} />
              <Text style={styles.primaryButtonText}>Share Invitation</Text>
            </TouchableOpacity>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  shareButton: {
    padding: spacing.xs,
  },

  // Bet Info
  betInfo: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  betTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  betDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },

  // QR Code
  qrContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  qrCodeWrapper: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    borderRadius: spacing.radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },

  // Instructions
  instructions: {
    marginBottom: spacing.xl,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  instructionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  instructionText: {
    flex: 1,
  },
  instructionTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  instructionDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },

  // Action Buttons
  actionButtons: {
    marginTop: 'auto',
    paddingBottom: spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
});
