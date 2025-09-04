/**
 * Create Bet Screen
 * Screen for creating new bets
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, commonStyles, textStyles } from '../styles';
import { Header } from '../components/ui/Header';

export const CreateBetScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title="Create Bet"
        showBalance={true}
        balance={1245.75}
      />
      
      <View style={styles.content}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Create New Bet</Text>
          <Text style={styles.placeholderText}>
            Bet creation form will be implemented here
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholder: {
    alignItems: 'center',
  },
  placeholderTitle: {
    ...textStyles.h2,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  placeholderText: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});