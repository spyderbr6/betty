/**
 * Two sides as tiles: tap the one you back. The link on the label row offers the other
 * sides (the teams, Yes / No, Over / Under, Custom); Custom makes the names editable.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { LIMITS } from '../../../amplify/shared/createBetLogic';
import { createStyles } from './styles';
import { MarkedLabel, type FillMarkKind } from './FillMark';

export interface SidePreset {
  id: string;
  label: string;
  /** Null for Custom, which keeps the current names and lets them be typed */
  options: [string, string] | null;
}

interface SidePresetSwitchProps {
  presets: SidePreset[];
  activeId: string;
  onPick: (preset: SidePreset) => void;
  label: string;
  /** The sides were filled from the typed bet */
  mark?: FillMarkKind;
}

/** The label row, and its link to the other sides. */
export const SidePresetSwitch: React.FC<SidePresetSwitchProps> = ({ presets, activeId, onPick, label, mark }) => {
  const [open, setOpen] = useState(false);
  const others = presets.filter((preset) => preset.id !== activeId);
  // The link names the first other choice, as the design does ("Yes / No" under the teams)
  const offer = others.find((preset) => preset.options) ?? others[0];
  return (
    <>
      <View style={createStyles.labelRow}>
        <MarkedLabel label={label} kind={mark} long testID="create-sides-mark" />
        <TouchableOpacity
          testID="create-side-presets"
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel="Change the sides"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={createStyles.link}>{open ? 'Close' : offer?.label ?? 'Sides'}</Text>
        </TouchableOpacity>
      </View>
      {open && (
        <View style={createStyles.chipRow}>
          {others.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              testID={`create-side-preset-${preset.id}`}
              style={createStyles.chip}
              onPress={() => {
                onPick(preset);
                setOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={createStyles.chipText}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
};

interface SideTileProps {
  name: string;
  picked: boolean;
  editable: boolean;
  onPick: () => void;
  onRename: (name: string) => void;
  testID: string;
  pickedHint?: string;
  idleHint?: string;
  /** A compact tile (the challenge card's) */
  compact?: boolean;
  /** Only a guess from the typed bet: dashed outline */
  guess?: boolean;
}

export const SideTile: React.FC<SideTileProps> = ({
  name,
  picked,
  editable,
  onPick,
  onRename,
  testID,
  pickedHint = '✓ YOUR SIDE',
  idleHint = 'Tap to back',
  compact,
  guess,
}) => (
  <TouchableOpacity
    testID={testID}
    style={[styles.tile, compact && styles.tileCompact, guess && !picked && createStyles.guess, picked && createStyles.picked]}
    onPress={onPick}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityState={{ selected: picked }}
    accessibilityLabel={`Back ${name || 'this side'}`}
  >
    {editable ? (
      <TextInput
        testID={`${testID}-name`}
        style={[styles.name, styles.input, compact && styles.nameCompact]}
        value={name}
        onChangeText={onRename}
        placeholder="Side name"
        placeholderTextColor={colors.textMuted}
        maxLength={LIMITS.sideName}
        accessibilityLabel="Side name"
      />
    ) : (
      <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>
        {name}
      </Text>
    )}
    {!compact && <Text style={[styles.hint, picked && styles.hintPicked]}>{picked ? pickedHint : idleHint}</Text>}
  </TouchableOpacity>
);

interface SidePickerProps {
  options: string[];
  pickedIndex: number | null;
  onPick: (index: number) => void;
  onRename: (index: number, name: string) => void;
  presets: SidePreset[];
  activePresetId: string;
  onPreset: (preset: SidePreset) => void;
  mark?: FillMarkKind;
}

export const SidePicker: React.FC<SidePickerProps> = ({
  options,
  pickedIndex,
  onPick,
  onRename,
  presets,
  activePresetId,
  onPreset,
  mark,
}) => (
  <View style={createStyles.block}>
    <SidePresetSwitch label="Tap your side" presets={presets} activeId={activePresetId} onPick={onPreset} mark={mark} />
    <View style={styles.row}>
      {options.slice(0, 2).map((name, index) => (
        <View key={index} style={[styles.cell, index === 1 && styles.cellRight]}>
          <SideTile
            testID={`create-side-${index === 0 ? 'a' : 'b'}`}
            name={name}
            picked={pickedIndex === index}
            editable={activePresetId === 'custom'}
            onPick={() => onPick(index)}
            onRename={(text) => onRename(index, text)}
            guess={mark === 'guess'}
          />
        </View>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
  },
  cellRight: {
    marginLeft: spacing.sm,
  },
  tile: {
    height: spacing[16] + spacing.sm, // 72, the design's side tile
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.padding.sm,
    paddingVertical: spacing.padding.xs + spacing.xs / 2,
    justifyContent: 'space-between',
  },
  tileCompact: {
    alignSelf: 'stretch',
    height: spacing[11],
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
  },
  name: {
    ...textStyles.h3,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  nameCompact: {
    fontSize: typography.fontSize.base,
    textAlign: 'center',
  },
  input: {
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    textAlignVertical: 'center',
  },
  hint: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  hintPicked: {
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.wide,
  },
});
