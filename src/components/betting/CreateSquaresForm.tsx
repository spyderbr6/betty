/**
 * Create Squares Form
 * Form component for creating new betting squares games
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, textStyles, spacing, typography } from '../../styles';
import { Ionicons } from '@expo/vector-icons';
import { SquaresGameService } from '../../services/squaresGameService';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../ui/CustomAlert';
import { EventPickerModal } from '../modals/EventPickerModal';

interface LiveEvent {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
  scheduledTime: string;
  status: string;
  sport?: string;
  league?: string;
}

interface CreateSquaresFormProps {
  onSuccess?: (squaresGameId: string) => void;
  onCancel?: () => void;
}

export const CreateSquaresForm: React.FC<CreateSquaresFormProps> = ({
  onSuccess,
  onCancel,
}) => {
  const { user } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState<LiveEvent | null>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [pricePerSquare, setPricePerSquare] = useState('10.00');
  const [isPriceFocused, setIsPriceFocused] = useState(false);
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Payout structure (percentages for each period)
  const [period1Payout, setPeriod1Payout] = useState(15);
  const [period2Payout, setPeriod2Payout] = useState(25);
  const [period3Payout, setPeriod3Payout] = useState(15);
  const [period4Payout, setPeriod4Payout] = useState(45);

  // Validate payout structure totals 100%
  const payoutTotal = period1Payout + period2Payout + period3Payout + period4Payout;
  const isPayoutValid = payoutTotal === 100;

  // Price validation
  const priceNum = parseFloat(pricePerSquare);
  const isPriceValid = !isNaN(priceNum) && priceNum >= 5 && priceNum <= 100;

  // Form validation
  const isFormValid = selectedEvent && isPriceValid && isPayoutValid;

  const handlePriceChange = (text: string) => {
    // Remove any non-numeric characters except decimal point
    const numericValue = text.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const parts = numericValue.split('.');
    const formattedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue;

    setPricePerSquare(formattedValue);
  };

  // Display value with currency formatting when not focused
  const displayPrice = (() => {
    if (isPriceFocused) return pricePerSquare;
    if (!pricePerSquare) return '';
    const n = parseFloat(pricePerSquare);
    if (isNaN(n)) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  })();

  const handlePayoutChange = (period: number, value: number) => {
    // Clamp value between 0 and 100
    const clampedValue = Math.max(0, Math.min(100, value));

    switch (period) {
      case 1:
        setPeriod1Payout(clampedValue);
        break;
      case 2:
        setPeriod2Payout(clampedValue);
        break;
      case 3:
        setPeriod3Payout(clampedValue);
        break;
      case 4:
        setPeriod4Payout(clampedValue);
        break;
    }
  };

  const handleCreate = async () => {
    if (!user || !selectedEvent || !isFormValid) return;

    setIsCreating(true);

    try {
      const price = parseFloat(pricePerSquare);

      // Create payout structure (convert percentages to decimals)
      const payoutStructure = {
        period1: period1Payout / 100,
        period2: period2Payout / 100,
        period3: period3Payout / 100,
        period4: period4Payout / 100,
      };

      // Create squares game (locksAt is automatically set to event scheduledTime)
      const gameId = await SquaresGameService.createSquaresGame({
        creatorId: user.userId,
        eventId: selectedEvent.id,
        title: `${selectedEvent.awayTeamCode || selectedEvent.awayTeam} @ ${selectedEvent.homeTeamCode || selectedEvent.homeTeam} Squares`,
        description: description.trim() || undefined,
        pricePerSquare: price,
        payoutStructure,
      });

      if (gameId) {
        showAlert(
          'Squares Game Created!',
          'Your betting squares game has been created. Start selling squares to fill the grid!'
        );

        if (onSuccess) {
          onSuccess(gameId);
        }
      }
    } catch (error) {
      console.error('Error creating squares game:', error);
      showAlert(
        'Error',
        'Failed to create squares game. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Event Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SELECT EVENT</Text>
        <Text style={styles.sectionSubtitle}>Choose a live event for your squares game</Text>

        {selectedEvent ? (
          <TouchableOpacity
            style={styles.selectedEventCard}
            onPress={() => setShowEventPicker(true)}
            activeOpacity={0.7}
          >
            <View style={styles.eventCardContent}>
              <View style={styles.eventTeams}>
                <Text style={styles.eventTeamText}>
                  {selectedEvent.awayTeamCode || selectedEvent.awayTeam}
                </Text>
                <Text style={styles.eventVsText}>@</Text>
                <Text style={styles.eventTeamText}>
                  {selectedEvent.homeTeamCode || selectedEvent.homeTeam}
                </Text>
              </View>
              <Text style={styles.eventTime}>
                {new Date(selectedEvent.scheduledTime).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.selectEventButton}
            onPress={() => setShowEventPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar" size={24} color={colors.primary} />
            <Text style={styles.selectEventText}>Tap to Select Event</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Price Per Square */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PRICE PER SQUARE</Text>
        <Text style={styles.sectionSubtitle}>Set the price for each square ($5 - $100)</Text>

        <TextInput
          style={[
            styles.priceInput,
            !isPriceValid && pricePerSquare && styles.priceInputInvalid,
          ]}
          placeholder="$0.00"
          placeholderTextColor={colors.textMuted}
          value={displayPrice}
          onChangeText={handlePriceChange}
          keyboardType="numeric"
          onFocus={() => setIsPriceFocused(true)}
          onBlur={() => {
            setIsPriceFocused(false);
            if (pricePerSquare) {
              const n = parseFloat(pricePerSquare);
              if (!isNaN(n)) setPricePerSquare(n.toFixed(2));
            }
          }}
        />
        {!isPriceValid && pricePerSquare ? (
          <Text style={styles.validationError}>Price must be between $5 and $100</Text>
        ) : null}
        <Text style={styles.fieldHint}>
          Total pot will be {priceNum && !isNaN(priceNum) ? `$${(priceNum * 100).toFixed(2)}` : '$0.00'} (100 squares)
        </Text>
      </View>

      {/* Payout Structure */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>PAYOUT STRUCTURE</Text>
            <Text style={styles.sectionSubtitle}>Set percentage for each period (must total 100%)</Text>
          </View>
          <View style={[
            styles.payoutTotalBadge,
            isPayoutValid ? styles.payoutTotalValid : styles.payoutTotalInvalid,
          ]}>
            <Text style={[
              styles.payoutTotalText,
              isPayoutValid ? styles.payoutTotalTextValid : styles.payoutTotalTextInvalid,
            ]}>
              {payoutTotal}%
            </Text>
          </View>
        </View>

        {/* Period 1 */}
        <View style={styles.payoutRow}>
          <View style={styles.payoutLabel}>
            <Text style={styles.payoutPeriodText}>Period 1</Text>
            <Text style={styles.payoutValueText}>{period1Payout}%</Text>
          </View>
          <View style={styles.payoutControls}>
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(1, period1Payout - 5)}
            >
              <Ionicons name="remove" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.payoutInput}
              value={period1Payout.toString()}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                handlePayoutChange(1, val);
              }}
              keyboardType="numeric"
              maxLength={3}
            />
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(1, period1Payout + 5)}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Period 2 (Halftime) */}
        <View style={styles.payoutRow}>
          <View style={styles.payoutLabel}>
            <Text style={styles.payoutPeriodText}>Period 2 (Halftime)</Text>
            <Text style={styles.payoutValueText}>{period2Payout}%</Text>
          </View>
          <View style={styles.payoutControls}>
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(2, period2Payout - 5)}
            >
              <Ionicons name="remove" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.payoutInput}
              value={period2Payout.toString()}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                handlePayoutChange(2, val);
              }}
              keyboardType="numeric"
              maxLength={3}
            />
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(2, period2Payout + 5)}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Period 3 */}
        <View style={styles.payoutRow}>
          <View style={styles.payoutLabel}>
            <Text style={styles.payoutPeriodText}>Period 3</Text>
            <Text style={styles.payoutValueText}>{period3Payout}%</Text>
          </View>
          <View style={styles.payoutControls}>
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(3, period3Payout - 5)}
            >
              <Ionicons name="remove" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.payoutInput}
              value={period3Payout.toString()}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                handlePayoutChange(3, val);
              }}
              keyboardType="numeric"
              maxLength={3}
            />
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(3, period3Payout + 5)}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Period 4 (Final) */}
        <View style={styles.payoutRow}>
          <View style={styles.payoutLabel}>
            <Text style={styles.payoutPeriodText}>Period 4 (Final)</Text>
            <Text style={styles.payoutValueText}>{period4Payout}%</Text>
          </View>
          <View style={styles.payoutControls}>
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(4, period4Payout - 5)}
            >
              <Ionicons name="remove" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.payoutInput}
              value={period4Payout.toString()}
              onChangeText={(text) => {
                const val = parseInt(text) || 0;
                handlePayoutChange(4, val);
              }}
              keyboardType="numeric"
              maxLength={3}
            />
            <TouchableOpacity
              style={styles.payoutButton}
              onPress={() => handlePayoutChange(4, period4Payout + 5)}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {!isPayoutValid && (
          <Text style={styles.validationError}>Payouts must total exactly 100%</Text>
        )}
      </View>

      {/* Optional Description */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DESCRIPTION (OPTIONAL)</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="Add any additional details or rules..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          maxLength={500}
        />
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {onCancel && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isCreating}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.createButton,
            !isFormValid && styles.createButtonDisabled,
          ]}
          onPress={handleCreate}
          disabled={!isFormValid || isCreating}
          activeOpacity={!isFormValid || isCreating ? 1 : 0.7}
        >
          {isCreating ? (
            <View style={styles.createButtonContent}>
              <ActivityIndicator size="small" color={colors.background} />
              <Text style={[styles.createButtonText, { marginLeft: spacing.sm }]}>
                CREATING...
              </Text>
            </View>
          ) : (
            <Text style={styles.createButtonText}>CREATE SQUARES GAME</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Event Picker Modal */}
      {showEventPicker && (
        <EventPickerModal
          visible={showEventPicker}
          onSelect={(event) => {
            setSelectedEvent(event);
            setShowEventPicker(false);
          }}
          onClose={() => setShowEventPicker(false)}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing.xl,
  },

  // Sections
  section: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.bold,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Event Selection
  selectedEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  eventCardContent: {
    flex: 1,
  },
  eventTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  eventTeamText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  eventVsText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  eventTime: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  selectEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  selectEventText: {
    ...textStyles.body,
    color: colors.primary,
    marginLeft: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },

  // Price Input
  priceInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  priceInputInvalid: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  fieldHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  validationError: {
    ...textStyles.caption,
    color: colors.error,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // Payout Structure
  payoutTotalBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    minWidth: 60,
    alignItems: 'center',
  },
  payoutTotalValid: {
    backgroundColor: colors.success,
  },
  payoutTotalInvalid: {
    backgroundColor: colors.error,
  },
  payoutTotalText: {
    ...textStyles.button,
    fontWeight: typography.fontWeight.bold,
  },
  payoutTotalTextValid: {
    color: colors.background,
  },
  payoutTotalTextInvalid: {
    color: colors.background,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  payoutLabel: {
    flex: 1,
  },
  payoutPeriodText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs / 2,
  },
  payoutValueText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  payoutControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payoutButton: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payoutInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginHorizontal: spacing.sm,
    width: 50,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    textAlignVertical: 'center',
  },

  // Description
  descriptionInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    textAlignVertical: 'top',
    height: 80,
  },

  // Buttons
  buttonContainer: {
    flexDirection: 'row',
    padding: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
  createButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  createButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
});
