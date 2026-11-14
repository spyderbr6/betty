/**
 * The question everyone bets on, with optional details behind "+ Add details".
 */

import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles } from '../../styles';
import { LIMITS } from '../../../amplify/shared/createBetLogic';
import { createStyles } from './styles';

interface BetQuestionProps {
  title: string;
  onTitleChange: (title: string) => void;
  details: string;
  onDetailsChange: (details: string) => void;
  showDetails: boolean;
  onShowDetails: () => void;
  placeholder: string;
}

export const BetQuestion = forwardRef<TextInput, BetQuestionProps>(
  ({ title, onTitleChange, details, onDetailsChange, showDetails, onShowDetails, placeholder }, ref) => (
    <View style={createStyles.block}>
      <TextInput
        ref={ref}
        testID="create-title"
        style={styles.title}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={onTitleChange}
        maxLength={LIMITS.title}
        multiline
        accessibilityLabel="What's the bet?"
      />
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
      {showDetails && (
        <TextInput
          testID="create-description"
          style={styles.details}
          placeholder="Details, rules, what decides it (optional)"
          placeholderTextColor={colors.textMuted}
          value={details}
          onChangeText={onDetailsChange}
          maxLength={LIMITS.description}
          multiline
          autoFocus
          accessibilityLabel="Details"
        />
      )}
    </View>
  ),
);
BetQuestion.displayName = 'BetQuestion';

const styles = StyleSheet.create({
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    textAlignVertical: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
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
  details: {
    ...textStyles.body,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.padding.sm,
    marginTop: spacing.sm,
    minHeight: spacing[16],
  },
});
