/**
 * A pool's three to six options in a two-column grid of equal tiles: tap your pick (a
 * yellow check marks it). "Edit" turns the names into fields with a remove button each.
 */

import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
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
}) => {
  const cells: Array<{ kind: 'option'; index: number } | { kind: 'add' }> = options.map((_, index) => ({
    kind: 'option' as const,
    index,
  }));
  if (options.length < MAX_OPTIONS) cells.push({ kind: 'add' });
  // Pairs, so both columns are always the same width whatever the count
  const rows: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));

  return (
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
      {rows.map((row, r) => (
        <View key={r} style={[styles.row, r > 0 && styles.rowGap]}>
          {row.map((cell, c) => {
            const spacer = c === 1 ? styles.cellRight : null;
            if (cell.kind === 'add') {
              return (
                <TouchableOpacity
                  key="add"
                  testID="create-option-add"
                  style={[styles.tile, styles.add, spacer]}
                  onPress={onAdd}
                  accessibilityRole="button"
                >
                  <Text style={styles.addText}>+ Add option</Text>
                </TouchableOpacity>
              );
            }
            const { index } = cell;
            const name = options[index];
            const key = OPTION_KEYS[index].toLowerCase();
            const picked = pickedIndex === index;
            return (
              <TouchableOpacity
                key={key}
                testID={`create-option-${key}`}
                style={[styles.tile, spacer, picked && createStyles.picked]}
                onPress={() => onPick(index)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: picked }}
                accessibilityLabel={`Back ${name || `option ${index + 1}`}`}
              >
                {picked && (
                  <View style={styles.check}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                )}
                {editing ? (
                  <TextInput
                    testID={`create-option-${key}-name`}
                    style={[styles.name, styles.input]}
                    value={name}
                    onChangeText={(text) => onRename(index, text)}
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor={colors.textMuted}
                    maxLength={LIMITS.sideName}
                    accessibilityLabel={`Option ${index + 1} name`}
                  />
                ) : (
                  <Text style={[styles.name, !name && styles.placeholder]} numberOfLines={1}>
                    {name || `Option ${index + 1}`}
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
                    <Text style={styles.remove}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
          {row.length === 1 && <View style={[styles.empty, styles.cellRight]} />}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rowGap: {
    marginTop: spacing.sm,
  },
  tile: {
    flex: 1,
    height: spacing[12],
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.padding.sm,
  },
  cellRight: {
    marginLeft: spacing.sm,
  },
  empty: {
    flex: 1,
  },
  add: {
    borderStyle: 'dashed',
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  addText: {
    ...textStyles.label,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: typography.letterSpacing.normal,
  },
  check: {
    width: spacing[5],
    height: spacing[5],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkText: {
    ...textStyles.caption,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  name: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  placeholder: {
    color: colors.textMuted,
  },
  input: {
    padding: 0,
    textAlignVertical: 'center',
  },
  remove: {
    ...textStyles.label,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
});
