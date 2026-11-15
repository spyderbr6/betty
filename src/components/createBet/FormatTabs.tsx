/**
 * The kind of bet: two sides, a pool, a one-on-one challenge, or squares (its own setup).
 * The selected tab is grey: yellow is for your pick and the create button.
 */

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { BetFormat } from '../../services/createBetFlowLogic';
import { createStyles } from './styles';

interface FormatTabsProps {
  value: BetFormat;
  onChange: (format: BetFormat) => void;
  onSquares: () => void;
}

const TABS: { id: BetFormat | 'squares'; label: string }[] = [
  { id: 'sides', label: '2 sides' },
  { id: 'pool', label: 'Pool' },
  { id: 'challenge', label: '1 v 1' },
  { id: 'squares', label: 'Squares ↗' },
];

export const FormatTabs: React.FC<FormatTabsProps> = ({ value, onChange, onSquares }) => (
  <View style={createStyles.block}>
    <View style={createStyles.segment} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const selected = tab.id === value;
        return (
          <TouchableOpacity
            key={tab.id}
            testID={`create-format-${tab.id}`}
            style={[createStyles.segmentItem, selected && createStyles.segmentItemActive]}
            onPress={() => (tab.id === 'squares' ? onSquares() : onChange(tab.id))}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[createStyles.segmentText, selected && createStyles.segmentTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);
