/**
 * PurchaseSquaresModal Component
 *
 * Modal for purchasing squares with owner name input.
 * Key feature: Allows buyer to put ANY name (supports non-members).
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModalHeader } from '../ui/ModalHeader';
import { colors, spacing, typography, textStyles } from '../../styles';
import { formatCurrency } from '../../utils/formatting';
import { showAlert } from '../ui/CustomAlert';

interface PurchaseSquaresModalProps {
  visible: boolean;
  onClose: () => void;
  game: any; // SquaresGame
  selectedSquares: Array<{ row: number; col: number }>;
  onConfirmPurchase: (ownerName: string) => Promise<void>;
  userDisplayName?: string;
}

export const PurchaseSquaresModal: React.FC<PurchaseSquaresModalProps> = ({
  visible,
  onClose,
  game,
  selectedSquares,
  onConfirmPurchase,
  userDisplayName,
}) => {
  const [ownerName, setOwnerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentNames, setRecentNames] = useState<string[]>([]);

  // Auto-fill with user's display name
  useEffect(() => {
    if (visible && userDisplayName) {
      setOwnerName(userDisplayName);
    }
  }, [visible, userDisplayName]);

  // Load recent owner names from localStorage (optional feature)
  useEffect(() => {
    if (visible) {
      // TODO: Load from AsyncStorage
      // For now, just show user's name
      setRecentNames([]);
    }
  }, [visible]);

  const totalCost = selectedSquares.length * game.pricePerSquare;

  const handleConfirm = async () => {
    if (!ownerName.trim()) {
      showAlert('Owner Name Required', 'Please enter a name for the square owner.');
      return;
    }

    if (ownerName.trim().length < 2) {
      showAlert('Invalid Name', 'Owner name must be at least 2 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirmPurchase(ownerName.trim());
      // Modal will be closed by parent component after successful purchase
    } catch (error) {
      console.error('Error purchasing squares:', error);
      showAlert(
        'Purchase Failed',
        error instanceof Error ? error.message : 'Failed to purchase squares. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setOwnerName('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Purchase Squares" onClose={handleClose} />

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Selected Squares Display */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Selected Squares</Text>
            <View style={styles.squaresList}>
              {selectedSquares.map((sq, idx) => (
                <View key={idx} style={styles.squareChip}>
                  <Text style={styles.squareChipText}>
                    ({sq.col}, {sq.row})
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Owner Name Input - KEY FEATURE */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Owner Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name or someone else's"
              placeholderTextColor={colors.textMuted}
              value={ownerName}
              onChangeText={setOwnerName}
              autoCapitalize="words"
              maxLength={50}
              editable={!isSubmitting}
              textAlignVertical="center" // Android
            />
            <Text style={styles.hint}>
              This name will appear on the grid. If you're buying for someone else (friend, family member,
              coworker), enter their name here. You'll receive any winnings and handle payment to them.
            </Text>
          </View>

          {/* Quick Name Suggestions */}
          {userDisplayName && (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionLabel}>Quick select:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsScroll}>
                <TouchableOpacity
                  style={[styles.suggestionChip, ownerName === userDisplayName && styles.suggestionChipSelected]}
                  onPress={() => setOwnerName(userDisplayName)}
                  disabled={isSubmitting}
                >
                  <Text
                    style={[
                      styles.suggestionChipText,
                      ownerName === userDisplayName && styles.suggestionChipTextSelected,
                    ]}
                  >
                    Me
                  </Text>
                </TouchableOpacity>
                {recentNames.map((name, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.suggestionChip, ownerName === name && styles.suggestionChipSelected]}
                    onPress={() => setOwnerName(name)}
                    disabled={isSubmitting}
                  >
                    <Text
                      style={[styles.suggestionChipText, ownerName === name && styles.suggestionChipTextSelected]}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Cost Summary */}
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Purchase Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Squares:</Text>
              <Text style={styles.summaryValue}>{selectedSquares.length}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Price each:</Text>
              <Text style={styles.summaryValue}>{formatCurrency(game.pricePerSquare)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total:</Text>
              <Text style={styles.totalAmount}>{formatCurrency(totalCost)}</Text>
            </View>
          </View>
        </ScrollView>

        {/* Confirm Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmButton, (!ownerName.trim() || isSubmitting) && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!ownerName.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.confirmButtonText}>
                Purchase {selectedSquares.length} Square{selectedSquares.length > 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
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
  },
  contentContainer: {
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  squaresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  squareChip: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  squareChipText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  input: {
    ...textStyles.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * 1.4,
  },
  suggestions: {
    marginBottom: spacing.lg,
  },
  suggestionLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  suggestionsScroll: {
    flexDirection: 'row',
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.xs,
  },
  suggestionChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  suggestionChipText: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  suggestionChipTextSelected: {
    color: colors.textInverse,
  },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  summaryLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
  totalAmount: {
    ...textStyles.h4,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  confirmButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
});
