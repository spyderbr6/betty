/**
 * The squares form, moved out of CreateBetScreen as it was so the Create redesign could
 * replace the bet form around it. Opened from the Squares ↗ tab, with the checked-in game
 * filled in. Its own redesign (a game list first, payout presets) comes next.
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, commonStyles, spacing, textStyles, typography } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../ui/CustomAlert';
import { SquaresGameService } from '../../services/squaresGameService';
import { EventPickerModal } from '../modals/EventPickerModal';
import type { LiveEvent } from '../../types/events';
import { createStyles } from './styles';

/** What the event picker hands back, and the parts of a checked-in game used here */
type SquaresEvent = Pick<LiveEvent, 'id' | 'homeTeam' | 'awayTeam' | 'homeTeamCode' | 'awayTeamCode' | 'scheduledTime'>;

interface SquaresSetupProps {
  initialEvent: LiveEvent | null;
  onBack: () => void;
  onCreated: (message: string) => void;
}

export const SquaresSetup: React.FC<SquaresSetupProps> = ({ initialEvent, onBack, onCreated }) => {
  const { user } = useAuth();
  // A game that has started cannot take squares, so only an upcoming one is filled in
  const [selectedEvent, setSelectedEvent] = useState<SquaresEvent | null>(initialEvent?.status === 'UPCOMING' ? initialEvent : null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [pricePerSquare, setPricePerSquare] = useState('10.00');
  const [isPriceFocused, setIsPriceFocused] = useState(false);
  const [squaresDescription, setSquaresDescription] = useState('');
  const [period1Payout, setPeriod1Payout] = useState(15);
  const [period2Payout, setPeriod2Payout] = useState(25);
  const [period3Payout, setPeriod3Payout] = useState(15);
  const [period4Payout, setPeriod4Payout] = useState(45);
  const [isPrivate, setIsPrivate] = useState(true); // Squares default to private, as before
  const [isCreating, setIsCreating] = useState(false);

  const payoutTotal = period1Payout + period2Payout + period3Payout + period4Payout;

  const handleCreateSquares = async () => {
    if (!user) return;
    if (!selectedEvent?.id) {
      showAlert('No Event Selected', 'Please select an event for your squares game.');
      return;
    }
    const price = parseFloat(pricePerSquare);
    if (isNaN(price) || price < 1 || price > 100) {
      showAlert('Invalid Price', 'Price per square must be between $1 and $100.');
      return;
    }

    setIsCreating(true);
    try {
      const payoutStructure = {
        period1: period1Payout / 100,
        period2: period2Payout / 100,
        period3: period3Payout / 100,
        period4: period4Payout / 100,
      };
      const game = await SquaresGameService.createSquaresGame({
        creatorId: user.userId,
        eventId: selectedEvent.id,
        title: `${selectedEvent.awayTeamCode || selectedEvent.awayTeam} @ ${selectedEvent.homeTeamCode || selectedEvent.homeTeam} Squares`,
        description: squaresDescription.trim() || undefined,
        pricePerSquare: price,
        payoutStructure,
        isPrivate,
      });
      if (!game?.id) throw new Error('Game creation returned invalid response');

      setSelectedEvent(null);
      setPricePerSquare('10.00');
      setSquaresDescription('');
      setPeriod1Payout(15);
      setPeriod2Payout(25);
      setPeriod3Payout(15);
      setPeriod4Payout(45);
      onCreated('Squares game created! Start selling squares to fill the grid.');
    } catch (error) {
      console.error('[CreateSquares] Error creating squares game:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      showAlert('Error', `Failed to create squares game: ${message}`, [{ text: 'OK' }]);
    } finally {
      setIsCreating(false);
    }
  };

  const disabled = isCreating || !selectedEvent || payoutTotal !== 100;

  return (
    <View testID="create-squares">
      <View style={createStyles.block}>
        <TouchableOpacity testID="create-squares-back" onPress={onBack} accessibilityRole="button">
          <Text style={createStyles.link}>‹ Back to bet</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SELECT EVENT</Text>
        <Text style={styles.sectionSubtitle}>Choose a live event for your squares game</Text>
        {selectedEvent ? (
          <TouchableOpacity style={styles.selectedEventCard} onPress={() => setShowEventPicker(true)} activeOpacity={0.7}>
            <View style={styles.eventCardContent}>
              <View style={styles.eventTeams}>
                <Text style={styles.eventTeamText}>{selectedEvent.awayTeamCode || selectedEvent.awayTeam}</Text>
                <Text style={styles.eventVsText}>@</Text>
                <Text style={styles.eventTeamText}>{selectedEvent.homeTeamCode || selectedEvent.homeTeam}</Text>
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
          <TouchableOpacity style={styles.selectEventButton} onPress={() => setShowEventPicker(true)} activeOpacity={0.7}>
            <Ionicons name="calendar" size={24} color={colors.primary} />
            <Text style={styles.selectEventText}>Tap to Select Event</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PRICE PER SQUARE</Text>
        <Text style={styles.sectionSubtitle}>Set the price for each square ($5 - $100)</Text>
        <TextInput
          style={[styles.textInput, styles.priceInput]}
          placeholder="$0.00"
          placeholderTextColor={colors.textMuted}
          value={isPriceFocused ? pricePerSquare : `$${parseFloat(pricePerSquare || '0').toFixed(2)}`}
          onChangeText={(text) => {
            const numericValue = text.replace(/[^0-9.]/g, '');
            const parts = numericValue.split('.');
            setPricePerSquare(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue);
          }}
          keyboardType="numeric"
          onFocus={() => setIsPriceFocused(true)}
          onBlur={() => {
            setIsPriceFocused(false);
            const n = parseFloat(pricePerSquare);
            if (!isNaN(n)) setPricePerSquare(n.toFixed(2));
          }}
        />
        <Text style={styles.fieldHint}>
          Total pot will be ${(parseFloat(pricePerSquare || '0') * 100).toFixed(2)} (100 squares)
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>PAYOUT STRUCTURE</Text>
            <Text style={styles.sectionSubtitle}>Percentage for each period (must total 100%)</Text>
          </View>
          <View style={[styles.payoutTotalBadge, payoutTotal === 100 ? styles.payoutTotalValid : styles.payoutTotalInvalid]}>
            <Text style={styles.payoutTotalText}>{payoutTotal}%</Text>
          </View>
        </View>
        {[
          { label: 'Period 1', value: period1Payout, setter: setPeriod1Payout },
          { label: 'Period 2 (Halftime)', value: period2Payout, setter: setPeriod2Payout },
          { label: 'Period 3', value: period3Payout, setter: setPeriod3Payout },
          { label: 'Period 4 (Final)', value: period4Payout, setter: setPeriod4Payout },
        ].map((period, index) => (
          <View key={index} style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>
              {period.label}: {period.value}%
            </Text>
            <View style={styles.payoutControls}>
              <TouchableOpacity style={styles.payoutButton} onPress={() => period.setter(Math.max(0, period.value - 5))}>
                <Ionicons name="remove" size={16} color={colors.primary} />
              </TouchableOpacity>
              <TextInput
                style={styles.payoutInput}
                value={period.value.toString()}
                onChangeText={(text) => period.setter(Math.max(0, Math.min(100, parseInt(text) || 0)))}
                keyboardType="numeric"
                maxLength={3}
              />
              <TouchableOpacity style={styles.payoutButton} onPress={() => period.setter(Math.min(100, period.value + 5))}>
                <Ionicons name="add" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DESCRIPTION (OPTIONAL)</Text>
        <TextInput
          style={[styles.textInput, styles.textAreaInput]}
          placeholder="Add any additional details or rules..."
          placeholderTextColor={colors.textMuted}
          value={squaresDescription}
          onChangeText={setSquaresDescription}
          multiline
          numberOfLines={3}
          maxLength={500}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Private Game</Text>
            <Text style={styles.settingDescription}>Only invited users can join</Text>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.background}
          />
        </View>
      </View>

      <View style={styles.createButtonContainer}>
        <TouchableOpacity
          testID="create-squares-submit"
          style={[styles.createButton, disabled && styles.createButtonDisabled]}
          onPress={handleCreateSquares}
          disabled={disabled}
          activeOpacity={disabled ? 1 : 0.7}
        >
          {isCreating ? (
            <View style={styles.createButtonContent}>
              <ActivityIndicator size="small" color={colors.background} />
              <Text style={[styles.createButtonText, { marginLeft: spacing.sm }]}>CREATING...</Text>
            </View>
          ) : (
            <Text style={styles.createButtonText}>CREATE SQUARES GAME</Text>
          )}
        </TouchableOpacity>
      </View>

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
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  fieldHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  textInput: {
    ...commonStyles.textInput,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    textAlignVertical: 'center',
  },
  textAreaInput: {
    height: spacing[20],
    textAlignVertical: 'top',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  settingLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  settingDescription: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  createButtonContainer: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  createButton: {
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
    fontSize: typography.fontSize.lg,
  },
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
  priceInput: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  payoutTotalBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    minWidth: spacing[16],
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
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  payoutLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
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
    width: spacing[12],
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    textAlignVertical: 'center',
  },
});
