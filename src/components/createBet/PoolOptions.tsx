/**
 * A pool's three to six options in a two-column grid: tap your pick. "Edit" turns the
 * tiles into name fields with a remove button each.
 */

import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles } from '../../styles';
import { MAX_OPTIONS, MIN_POOL_OPTIONS, OPTION_KEYS } from '../../../amplify/shared/betOptions';
import { LIMITS } from '../../../amplify/shared/createBetLogic';
import { createStyles } from './styles';

interface PoolOptionsProps {
  options: string[];
  pickedIndex: number | null;
  onPick: (index: number) => void;
  editing: boolean;
  onToggleEdit: () => void;
  onRename: (index: number, name: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export const PoolOptions: React.FC<PoolOptionsProps> = ({
  options,
  pickedIndex,
  onPick,
  editing,
  onToggleEdit,
  onRename,
  onAdd,
  onRemove,
}) => (
  <View style={createStyles.block}>
    <View style={createStyles.labelRow}>
      <Text style={createStyles.label}>
        Tap your pick · {options.length} of {MAX_OPTIONS}
      </Text>
      <TouchableOpacity
        testID="create-option-edit"
        onPress={onToggleEdit}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={createStyles.link}>{editing ? 'Done' : 'Edit'}</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.grid}>
      {options.map((name, index) => {
        const key = OPTION_KEYS[index].toLowerCase();
        const picked = pickedIndex === index;
        return (
          <View key={key} style={styles.cell}>
            <TouchableOpacity
              testID={`create-option-${key}`}
              style={[styles.option, picked && createStyles.tileSelected]}
              onPress={() => onPick(index)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: picked }}
              accessibilityLabel={`Back ${name || `option ${index + 1}`}`}
            >
              {editing ? (
                <TextInput
                  testID={`create-option-${key}-name`}
                  style={[styles.input, picked && createStyles.tileNameSelected]}
                  value={name}
                  onChangeText={(text) => onRename(index, text)}
                  placeholder={`Option ${index + 1}`}
                  placeholderTextColor={picked ? colors.textInverse : colors.textMuted}
                  maxLength={LIMITS.sideName}
                  accessibilityLabel={`Option ${index + 1} name`}
                />
              ) : (
                <Text style={[styles.name, picked && createStyles.tileNameSelected]} numberOfLines={2}>
                  {picked ? `✓ ${name}` : name || `Option ${index + 1}`}
                </Text>
              )}
              {editing && options.length > MIN_POOL_OPTIONS && (
                <TouchableOpacity
                  testID={`create-option-${key}-remove`}
                  onPress={() => onRemove(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove option ${index + 1}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.remove, picked && createStyles.tileNameSelected]}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
      {options.length < MAX_OPTIONS && (
        <View style={styles.cell}>
          <TouchableOpacity
            testID="create-option-add"
            style={[styles.option, styles.add]}
            onPress={onAdd}
            accessibilityRole="button"
          >
            <Text style={createStyles.link}>+ Add option</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  cell: {
    width: '50%',
    padding: spacing.xs,
  },
  option: {
    minHeight: spacing[14],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.padding.sm,
  },
  add: {
    borderStyle: 'dashed',
    backgroundColor: colors.background,
  },
  name: {
    ...textStyles.label,
    color: colors.textPrimary,
    textAlign: 'center',
    flexShrink: 1,
  },
  input: {
    ...textStyles.label,
    color: colors.textPrimary,
    textAlignVertical: 'center',
    flex: 1,
    paddingVertical: spacing.xs,
  },
  remove: {
    ...textStyles.label,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});
