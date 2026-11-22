/**
 * One-tap bets on the game you are at: a tap fills the question and the sides; tapping
 * the selected one again clears it. Shown in every format (the screen orders them with
 * the current format first); a chip that switches the format says so ("Next score · Pool").
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../../styles';
import { suggestionTag, type BetSuggestion } from '../../services/createBetFlowLogic';
import { createStyles } from './styles';

interface SuggestionChipsProps {
  suggestions: BetSuggestion[];
  activeId: string | null;
  /** Called with the chip tapped; the screen clears it when it was already active */
  onPick: (suggestion: BetSuggestion) => void;
}

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({ suggestions, activeId, onPick }) => {
  if (suggestions.length === 0) return null;
  return (
    <View style={createStyles.block}>
      <Text style={[createStyles.label, styles.label]}>Bet on this game</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {suggestions.map((suggestion) => {
          const active = suggestion.id === activeId;
          const tag = suggestionTag(suggestion.format);
          return (
            <TouchableOpacity
              key={suggestion.id}
              testID={`create-suggestion-${suggestion.id}`}
              style={[createStyles.chip, styles.chip, active && createStyles.chipSelected]}
              onPress={() => onPick(suggestion)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityHint={active ? 'Tap again to clear' : undefined}
            >
              <Text style={[createStyles.chipText, active && createStyles.chipTextSelected]}>
                {suggestion.label}
                {tag && (
                  <Text testID={`create-suggestion-${suggestion.id}-tag`} style={[styles.tag, active && createStyles.chipTextSelected]}>
                    {`  ${tag}`}
                  </Text>
                )}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
  },
  // Runs to the screen edge, so a cut-off chip shows there are more
  scroll: {
    marginRight: -spacing.md,
  },
  content: {
    paddingRight: spacing.md,
  },
  chip: {
    marginBottom: 0,
  },
  tag: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.normal,
  },
});
