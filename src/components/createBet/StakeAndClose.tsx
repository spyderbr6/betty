/**
 * Stake and closing time, side by side. The stake steps through STAKE_STEPS (tap the
 * amount to type one) and turns red above the balance. Closing time opens a row of
 * durations; "Pick a date" adds a day row and a time stepper.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import {
  formatStake,
  initialPickedDate,
  stepStake,
  type CloseTimeId,
  type CloseTimeOption,
} from '../../services/createBetFlowLogic';
import { createStyles } from './styles';

interface StakeAndCloseProps {
  stake: number;
  onStakeChange: (stake: number) => void;
  overBalance: boolean;
  closeOptions: CloseTimeOption[];
  closeId: CloseTimeId;
  onCloseChange: (id: CloseTimeId) => void;
  /** "9:56 PM", or null when the picked date is not usable */
  closeAt: string | null;
  pickedDate: Date | null;
  onPickedDateChange: (date: Date) => void;
  now: Date;
}

const DAYS_AHEAD = 14;
const TIME_STEP_MINUTES = 30;


export const StakeAndClose: React.FC<StakeAndCloseProps> = ({
  stake,
  onStakeChange,
  overBalance,
  closeOptions,
  closeId,
  onCloseChange,
  closeAt,
  pickedDate,
  onPickedDateChange,
  now,
}) => {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const closeLabel = closeOptions.find((option) => option.id === closeId)?.label ?? '';

  const finishTyping = () => {
    setTyping(false);
    const amount = Math.round(parseFloat(typed) * 100) / 100;
    if (Number.isFinite(amount) && amount > 0) onStakeChange(amount);
  };

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    return day;
  });
  const setDay = (day: Date) => {
    const base = pickedDate ?? initialPickedDate(now);
    const next = new Date(day);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onPickedDateChange(next);
  };
  const stepTime = (direction: 1 | -1) => {
    const base = pickedDate ?? initialPickedDate(now);
    onPickedDateChange(new Date(base.getTime() + direction * TIME_STEP_MINUTES * 60_000));
  };

  return (
    <View style={createStyles.block}>
      <View style={styles.row}>
        <View style={[styles.box, overBalance && styles.boxError]}>
          <Text style={createStyles.label}>Stake</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              testID="create-stake-down"
              style={styles.stepButton}
              onPress={() => onStakeChange(stepStake(stake, -1))}
              accessibilityRole="button"
              accessibilityLabel="Lower the stake"
            >
              <Text style={styles.stepText}>−</Text>
            </TouchableOpacity>
            {typing ? (
              <TextInput
                testID="create-amount"
                style={[styles.amount, styles.amountInput]}
                value={typed}
                onChangeText={(text) => setTyped(text.replace(/[^0-9.]/g, ''))}
                onBlur={finishTyping}
                onSubmitEditing={finishTyping}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                accessibilityLabel="Stake in dollars"
              />
            ) : (
              <TouchableOpacity
                testID="create-stake-value"
                onPress={() => {
                  setTyped(String(stake));
                  setTyping(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Stake ${formatStake(stake)}, tap to type an amount`}
              >
                <Text style={[styles.amount, overBalance && styles.errorText]}>{formatStake(stake)}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID="create-stake-up"
              style={styles.stepButton}
              onPress={() => onStakeChange(stepStake(stake, 1))}
              accessibilityRole="button"
              accessibilityLabel="Raise the stake"
            >
              <Text style={styles.stepText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          testID="create-close-time"
          style={[styles.box, styles.closeBox, closeOpen && styles.boxOpen]}
          onPress={() => setCloseOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={`Closes in ${closeLabel}${closeAt ? `, at ${closeAt}` : ''}. Change`}
        >
          <Text style={createStyles.label}>Closes</Text>
          <Text style={styles.closeLabel}>{closeLabel}</Text>
          <Text style={[styles.closeAt, !closeAt && styles.warningText]}>{closeAt ? `at ${closeAt}` : 'Pick a later time'}</Text>
        </TouchableOpacity>
      </View>

      {closeOpen && (
        <View style={styles.closeOptions}>
          <View style={createStyles.chipRow}>
            {closeOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                testID={`create-close-${option.id}`}
                style={[createStyles.chip, option.id === closeId && createStyles.chipSelected]}
                onPress={() => {
                  onCloseChange(option.id);
                  if (option.id !== 'date') setCloseOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: option.id === closeId }}
              >
                <Text style={createStyles.chipText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {closeId === 'date' && (
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {days.map((day, i) => {
                  const active = !!pickedDate && pickedDate.toDateString() === day.toDateString();
                  return (
                    <TouchableOpacity
                      key={day.toDateString()}
                      testID={`create-close-day-${i}`}
                      style={[createStyles.chip, active && createStyles.chipSelected]}
                      onPress={() => setDay(day)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={createStyles.chipText}>
                        {i === 0
                          ? 'Today'
                          : i === 1
                            ? 'Tomorrow'
                            : day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.timeRow}>
                <TouchableOpacity
                  testID="create-close-earlier"
                  style={styles.stepButton}
                  onPress={() => stepTime(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Half an hour earlier"
                >
                  <Text style={styles.stepText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.time}>
                  {(pickedDate ?? initialPickedDate(now)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <TouchableOpacity
                  testID="create-close-later"
                  style={styles.stepButton}
                  onPress={() => stepTime(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Half an hour later"
                >
                  <Text style={styles.stepText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="create-close-done"
                  onPress={() => setCloseOpen(false)}
                  accessibilityRole="button"
                  style={styles.done}
                >
                  <Text style={createStyles.link}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  box: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.padding.sm,
  },
  boxError: {
    borderColor: colors.error,
  },
  boxOpen: {
    borderColor: colors.textSecondary,
  },
  closeBox: {
    marginLeft: spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  stepButton: {
    width: spacing[9],
    height: spacing[9],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    ...textStyles.h3,
    color: colors.textPrimary,
  },
  amount: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
    textAlign: 'center',
  },
  amountInput: {
    minWidth: spacing[16],
    textAlignVertical: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 0,
  },
  warningText: {
    color: colors.warning,
  },
  errorText: {
    color: colors.error,
  },
  closeLabel: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  closeAt: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  closeOptions: {
    marginTop: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  time: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginHorizontal: spacing.md,
    minWidth: spacing[20],
    textAlign: 'center',
  },
  done: {
    marginLeft: 'auto',
  },
});
