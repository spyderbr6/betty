/**
 * Stake and closing time, side by side, each a −/+ stepper as the design draws them. The
 * stake steps through STAKE_STEPS (tap the amount to type one) and turns red above the
 * balance. Closing time steps through the durations; tap it for every choice, including
 * a picked date (a day row and a half-hour stepper).
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
import { MarkedLabel, type FillMarkKind } from './FillMark';

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
  /** Filled from the typed bet (✦), or only guessed (dashed) */
  stakeMark?: FillMarkKind;
  closeMark?: FillMarkKind;
}

const DAYS_AHEAD = 14;
const TIME_STEP_MINUTES = 30;

interface StepperProps {
  label: string;
  onDown: () => void;
  onUp: () => void;
  downTestID: string;
  upTestID: string;
  downLabel: string;
  upLabel: string;
  children: React.ReactNode;
  error?: boolean;
  style?: object;
  mark?: FillMarkKind;
  markTestID?: string;
}

const Stepper: React.FC<StepperProps> = ({ label, onDown, onUp, downTestID, upTestID, downLabel, upLabel, children, error, style, mark, markTestID }) => (
  <View style={[createStyles.card, styles.box, mark === 'guess' && createStyles.guess, error && styles.boxError, style]}>
    <MarkedLabel label={label} kind={mark} testID={markTestID} />
    <View style={styles.stepRow}>
      <TouchableOpacity testID={downTestID} style={createStyles.stepButton} onPress={onDown} accessibilityRole="button" accessibilityLabel={downLabel}>
        <Text style={createStyles.stepText}>−</Text>
      </TouchableOpacity>
      <View style={styles.value}>{children}</View>
      <TouchableOpacity testID={upTestID} style={createStyles.stepButton} onPress={onUp} accessibilityRole="button" accessibilityLabel={upLabel}>
        <Text style={createStyles.stepText}>+</Text>
      </TouchableOpacity>
    </View>
  </View>
);

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
  stakeMark,
  closeMark,
}) => {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const closeLabel = closeOptions.find((option) => option.id === closeId)?.label ?? '';
  // The stepper moves through the durations; a picked date is reached by tapping
  const durations = closeOptions.filter((option) => option.id !== 'date');
  const stepClose = (direction: 1 | -1) => {
    const at = durations.findIndex((option) => option.id === closeId);
    const next = at === -1 ? (direction === 1 ? durations.length - 1 : 0) : Math.max(0, Math.min(durations.length - 1, at + direction));
    onCloseChange(durations[next].id);
  };

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
        <Stepper
          label="Stake"
          onDown={() => onStakeChange(stepStake(stake, -1))}
          onUp={() => onStakeChange(stepStake(stake, 1))}
          downTestID="create-stake-down"
          upTestID="create-stake-up"
          downLabel="Lower the stake"
          upLabel="Raise the stake"
          error={overBalance}
          style={styles.stakeBox}
          mark={stakeMark}
          markTestID="create-stake-mark"
        >
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
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={[styles.amount, overBalance && styles.errorText]}>{formatStake(stake)}</Text>
            </TouchableOpacity>
          )}
        </Stepper>

        <Stepper
          label="Closes"
          onDown={() => stepClose(-1)}
          onUp={() => stepClose(1)}
          downTestID="create-close-down"
          upTestID="create-close-up"
          downLabel="Close sooner"
          upLabel="Close later"
          style={styles.closeBox}
          mark={closeMark}
          markTestID="create-close-mark"
        >
          <TouchableOpacity
            testID="create-close-time"
            onPress={() => setCloseOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`Closes in ${closeLabel}${closeAt ? `, at ${closeAt}` : ''}. Show every choice`}
            style={styles.closeValue}
          >
            <Text style={styles.amount} numberOfLines={1}>
              {closeLabel}
            </Text>
            <Text style={[styles.closeAt, !closeAt && styles.warningText]} numberOfLines={1}>
              {closeAt ? `at ${closeAt}` : 'Pick a later time'}
            </Text>
          </TouchableOpacity>
        </Stepper>
      </View>

      {closeOpen && (
        <View style={styles.closeOptions}>
          <View style={createStyles.chipRow}>
            {closeOptions.map((option) => {
              const active = option.id === closeId;
              return (
                <TouchableOpacity
                  key={option.id}
                  testID={`create-close-${option.id}`}
                  style={[createStyles.chip, active && createStyles.chipSelected]}
                  onPress={() => {
                    onCloseChange(option.id);
                    if (option.id !== 'date') setCloseOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[createStyles.chipText, active && createStyles.chipTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
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
                      <Text style={[createStyles.chipText, active && createStyles.chipTextSelected]}>
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
                  style={createStyles.stepButton}
                  onPress={() => stepTime(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Half an hour earlier"
                >
                  <Text style={createStyles.stepText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.time}>
                  {(pickedDate ?? initialPickedDate(now)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <TouchableOpacity
                  testID="create-close-later"
                  style={createStyles.stepButton}
                  onPress={() => stepTime(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Half an hour later"
                >
                  <Text style={createStyles.stepText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="create-close-done" onPress={() => setCloseOpen(false)} accessibilityRole="button" style={styles.done}>
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
    paddingHorizontal: spacing.sm,
  },
  // 5:6, as the design splits the row
  stakeBox: {
    flex: 5,
  },
  closeBox: {
    flex: 6,
    marginLeft: spacing.sm,
  },
  boxError: {
    borderColor: colors.error,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  value: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
  closeValue: {
    alignItems: 'center',
  },
  amount: {
    ...textStyles.body,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  amountInput: {
    minWidth: spacing[12],
    textAlignVertical: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    padding: 0,
  },
  errorText: {
    color: colors.error,
  },
  warningText: {
    color: colors.warning,
  },
  closeAt: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  closeOptions: {
    marginTop: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
