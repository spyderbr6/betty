/**
 * Two sides as big tiles: tap the one you back. The quick-sides presets (the teams,
 * Yes / No, Over / Under, Custom) swap the names; Custom makes them editable.
 */

import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../../styles';
import { LIMITS } from '../../../amplify/shared/createBetLogic';
import { createStyles } from './styles';

export interface SidePreset {
  id: string;
  label: string;
  /** Null for Custom, which keeps the current names and lets them be typed */
  options: [string, string] | null;
}

interface SidePresetRowProps {
  presets: SidePreset[];
  activeId: string;
  onPick: (preset: SidePreset) => void;
}

/** The label row's switch: shows the current preset, and the others when opened. */
export const SidePresetSwitch: React.FC<SidePresetRowProps & { label: string }> = ({ presets, activeId, onPick, label }) => {
  const [open, setOpen] = useState(false);
  const active = presets.find((preset) => preset.id === activeId);
  return (
    <>
      <View style={createStyles.labelRow}>
        <Text style={createStyles.label}>{label}</Text>
        <TouchableOpacity
          testID="create-side-presets"
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel="Change the sides"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={createStyles.link}>{(active?.label ?? 'Sides') + (open ? ' ▴' : ' ▾')}</Text>
        </TouchableOpacity>
      </View>
      {open && (
        <View style={createStyles.chipRow}>
          {presets.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              testID={`create-side-preset-${preset.id}`}
              style={[createStyles.chip, preset.id === activeId && createStyles.chipSelected]}
              onPress={() => {
                onPick(preset);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: preset.id === activeId }}
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
}

export const SideTile: React.FC<SideTileProps> = ({ name, picked, editable, onPick, onRename, testID, pickedHint }) => (
  <TouchableOpacity
    testID={testID}
    style={[createStyles.tile, picked && createStyles.tileSelected]}
    onPress={onPick}
    activeOpacity={0.85}
    accessibilityRole="button"
    accessibilityState={{ selected: picked }}
    accessibilityLabel={`Back ${name || 'this side'}`}
  >
    {editable ? (
      <TextInput
        testID={`${testID}-name`}
        style={[createStyles.tileInput, picked && createStyles.tileNameSelected, picked && { borderBottomColor: colors.textInverse }]}
        value={name}
        onChangeText={onRename}
        placeholder="Side name"
        placeholderTextColor={picked ? colors.textInverse : colors.textMuted}
        maxLength={LIMITS.sideName}
        accessibilityLabel="Side name"
      />
    ) : (
      <Text style={[createStyles.tileName, picked && createStyles.tileNameSelected]} numberOfLines={2}>
        {name}
      </Text>
    )}
    <Text style={[createStyles.tileHint, picked && createStyles.tileHintSelected]}>
      {picked ? pickedHint ?? '✓ YOUR SIDE' : 'Tap to back'}
    </Text>
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
}

export const SidePicker: React.FC<SidePickerProps> = ({
  options,
  pickedIndex,
  onPick,
  onRename,
  presets,
  activePresetId,
  onPreset,
}) => {
  const editable = activePresetId === 'custom';
  return (
    <View style={createStyles.block}>
      <SidePresetSwitch label="Tap your side" presets={presets} activeId={activePresetId} onPick={onPreset} />
      <View style={{ flexDirection: 'row' }}>
        {options.slice(0, 2).map((name, index) => (
          <View key={index} style={{ flex: 1, marginLeft: index === 0 ? 0 : spacing.sm, flexDirection: 'row' }}>
            <SideTile
              testID={`create-side-${index === 0 ? 'a' : 'b'}`}
              name={name}
              picked={pickedIndex === index}
              editable={editable}
              onPick={() => onPick(index)}
              onRename={(text) => onRename(index, text)}
            />
          </View>
        ))}
      </View>
    </View>
  );
};
