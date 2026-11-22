/**
 * The question everyone bets on, in a card with "+ Add details" and the count. The card's
 * border is yellow while it is empty (it is the next thing to fill) and while you type in
 * it, which also stands in for the browser's focus outline on web.
 */

import { forwardRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { LIMITS } from '../../../amplify/shared/createBetLogic';
import { createStyles } from './styles';

interface BetQuestionProps {
  title: string;
  onTitleChange: (title: string) => void;
  /** Leaving the question (not the details) */
  onTitleBlur?: () => void;
  onTitleFocus?: () => void;
  /**
   * The typed bet filled fields: "✦ Cleaned up from what you typed" when words moved out
   * of the question, "✦ Filled from what you typed" otherwise, with Undo fill.
   */
  fill?: { cleaned: boolean } | null;
  onUndoFill?: () => void;
  /** ✕: empties the question, shown while it has text */
  onClear?: () => void;
  details: string;
  onDetailsChange: (details: string) => void;
  showDetails: boolean;
  onShowDetails: () => void;
  placeholder: string;
}

// A web textarea starts two rows tall; native grows with the text on its own
const ONE_ROW = Platform.OS === 'web' ? 1 : undefined;

export const BetQuestion = forwardRef<TextInput, BetQuestionProps>(
  ({ title, onTitleChange, onTitleBlur, onTitleFocus, fill, onUndoFill, onClear, details, onDetailsChange, showDetails, onShowDetails, placeholder }, ref) => {
    const [focused, setFocused] = useState(false);
    return (
      <View style={createStyles.block}>
        <View style={[createStyles.card, (focused || !title.trim()) && styles.cardActive]}>
          <View style={styles.titleRow}>
          <TextInput
            ref={ref}
            testID="create-title"
            style={[styles.title, styles.titleInput]}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={onTitleChange}
            onFocus={() => {
              setFocused(true);
              onTitleFocus?.();
            }}
            onBlur={() => {
              setFocused(false);
              onTitleBlur?.();
            }}
            maxLength={LIMITS.title}
            multiline
            numberOfLines={ONE_ROW}
            accessibilityLabel="What's the bet?"
          />
          {!!title && onClear && (
            <TouchableOpacity
              testID="create-clear-title"
              style={styles.clear}
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel="Clear the question"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          )}
          </View>
          {showDetails && (
            <TextInput
              testID="create-description"
              style={styles.details}
              placeholder="Details, rules, what decides it (optional)"
              placeholderTextColor={colors.textMuted}
              value={details}
              onChangeText={onDetailsChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={LIMITS.description}
              multiline
              autoFocus
              accessibilityLabel="Details"
            />
          )}
          {fill && !focused && (
            <View style={styles.fillRow}>
              <Text testID="create-fill-note" style={styles.fillNote}>
                {fill.cleaned ? '✦ Cleaned up from what you typed' : '✦ Filled from what you typed'}
              </Text>
              <TouchableOpacity
                testID="create-undo-fill"
                onPress={onUndoFill}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={createStyles.link}>Undo fill</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.metaRow}>
            {showDetails ? (
              <View />
            ) : (
              <TouchableOpacity testID="create-add-details" onPress={onShowDetails} accessibilityRole="button">
                <Text style={createStyles.link}>+ Add details</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.counter}>
              {title.length}/{LIMITS.title}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);
BetQuestion.displayName = 'BetQuestion';

const styles = StyleSheet.create({
  cardActive: {
    borderColor: colors.primary,
  },
  title: {
    ...textStyles.h4,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    padding: 0,
    outlineWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titleInput: {
    flex: 1,
  },
  // A round grey button, its 44px target made up by hitSlop
  clear: {
    width: spacing[6],
    height: spacing[6],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  clearText: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  details: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    padding: 0,
    marginTop: spacing.sm,
    minHeight: spacing[10],
    outlineWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  fillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  fillNote: {
    ...textStyles.caption,
    color: colors.filled,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  counter: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
});
