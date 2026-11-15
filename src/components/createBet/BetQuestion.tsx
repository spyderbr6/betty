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
  details: string;
  onDetailsChange: (details: string) => void;
  showDetails: boolean;
  onShowDetails: () => void;
  placeholder: string;
}

// A web textarea starts two rows tall; native grows with the text on its own
const ONE_ROW = Platform.OS === 'web' ? 1 : undefined;

export const BetQuestion = forwardRef<TextInput, BetQuestionProps>(
  ({ title, onTitleChange, onTitleBlur, details, onDetailsChange, showDetails, onShowDetails, placeholder }, ref) => {
    const [focused, setFocused] = useState(false);
    return (
      <View style={createStyles.block}>
        <View style={[createStyles.card, (focused || !title.trim()) && styles.cardActive]}>
          <TextInput
            ref={ref}
            testID="create-title"
            style={styles.title}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={onTitleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onTitleBlur?.();
            }}
            maxLength={LIMITS.title}
            multiline
            numberOfLines={ONE_ROW}
            accessibilityLabel="What's the bet?"
          />
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
  counter: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
});
