/**
 * One-tap bets on the game you are at: a tap fills the question and the sides.
 */

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { BetSuggestion } from '../../services/createBetFlowLogic';
import { createStyles } from './styles';

interface SuggestionChipsProps {
  suggestions: BetSuggestion[];
  activeId: string | null;
  onPick: (suggestion: BetSuggestion) => void;
}

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({ suggestions, activeId, onPick }) => {
  if (suggestions.length === 0) return null;
  return (
    <View style={createStyles.block}>
      <Text style={[createStyles.label, { marginBottom: createStyles.labelRow.marginBottom }]}>Bet on this game</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {suggestions.map((suggestion) => {
          const active = suggestion.id === activeId;
          return (
            <TouchableOpacity
              key={suggestion.id}
              testID={`create-suggestion-${suggestion.id}`}
              style={[createStyles.chip, active && createStyles.chipSelected]}
              onPress={() => onPick(suggestion)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={createStyles.chipText}>{suggestion.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};
