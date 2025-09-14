/**
 * Create Bet Screen
 * Professional bet creation interface with templates and bet types
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';

interface BetTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  odds: { sideA: number; sideB: number; sideAName: string; sideBName: string; };
}

export const CreateBetScreen: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [betTitle, setBetTitle] = useState('');
  const [betDescription, setBetDescription] = useState('');
  const [betAmount, setBetAmount] = useState('');
  const [deadline, setDeadline] = useState('30');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('SPORTS');
  const [customOdds, setCustomOdds] = useState(false);
  const [oddsA, setOddsA] = useState('-110');
  const [oddsB, setOddsB] = useState('+110');
  const [sideAName, setSideAName] = useState('Yes');
  const [sideBName, setSideBName] = useState('No');

  const betTemplates: BetTemplate[] = [
    {
      id: 'next-score',
      title: 'Next Score',
      description: 'Which team scores next?',
      category: 'SPORTS',
      icon: '🏀',
      odds: { sideA: -105, sideB: -115, sideAName: 'Home', sideBName: 'Away' },
    },
    {
      id: 'player-prop',
      title: 'Player Prop',
      description: 'Player performance bet',
      category: 'SPORTS',
      icon: '⭐',
      odds: { sideA: +120, sideB: -140, sideAName: 'Over', sideBName: 'Under' },
    },
    {
      id: 'yes-no',
      title: 'Yes/No Bet',
      description: 'Simple yes or no question',
      category: 'CUSTOM',
      icon: '❓',
      odds: { sideA: -110, sideB: -110, sideAName: 'Yes', sideBName: 'No' },
    },
    {
      id: 'weather',
      title: 'Weather Bet',
      description: 'Weather prediction bet',
      category: 'WEATHER',
      icon: '🌤️',
      odds: { sideA: +150, sideB: -180, sideAName: 'Rain', sideBName: 'No Rain' },
    },
    {
      id: 'entertainment',
      title: 'Entertainment',
      description: 'Entertainment event outcome',
      category: 'ENTERTAINMENT',
      icon: '🎬',
      odds: { sideA: +200, sideB: -250, sideAName: 'Winner A', sideBName: 'Winner B' },
    },
    {
      id: 'custom',
      title: 'Custom Bet',
      description: 'Create your own unique bet',
      category: 'CUSTOM',
      icon: '✨',
      odds: { sideA: -110, sideB: -110, sideAName: 'Side A', sideBName: 'Side B' },
    },
  ];

  const categories = ['SPORTS', 'ENTERTAINMENT', 'WEATHER', 'CUSTOM'];

  const handleTemplateSelect = (template: BetTemplate) => {
    setSelectedTemplate(template.id);
    setBetTitle(template.title);
    setBetDescription(template.description);
    setSelectedCategory(template.category);
    setOddsA(template.odds.sideA.toString());
    setOddsB(template.odds.sideB.toString());
    setSideAName(template.odds.sideAName);
    setSideBName(template.odds.sideBName);
  };

  const handleCreateBet = () => {
    if (!betTitle.trim() || !betDescription.trim() || !betAmount.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return;
    }

    // Mock bet creation
    Alert.alert(
      'Bet Created!',
      `Your bet "${betTitle}" has been created successfully.`,
      [{ text: 'OK' }]
    );

    // Reset form
    setSelectedTemplate(null);
    setBetTitle('');
    setBetDescription('');
    setBetAmount('');
    setDeadline('30');
    setIsPrivate(false);
    setCustomOdds(false);
  };

  const handleBalancePress = () => {
    console.log('Balance pressed');
  };

  const handleNotificationsPress = () => {
    console.log('Notifications pressed');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title="Create Bet"
        showBalance={true}
        balance={1245.75}
        onBalancePress={handleBalancePress}
        onNotificationsPress={handleNotificationsPress}
        variant="default"
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Bet Templates Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CHOOSE BET TYPE</Text>
          <Text style={styles.sectionSubtitle}>Select a template to get started quickly</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templatesScroll}>
            {betTemplates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[
                  styles.templateCard,
                  selectedTemplate === template.id && styles.templateCardSelected
                ]}
                onPress={() => handleTemplateSelect(template)}
              >
                <Text style={styles.templateIcon}>{template.icon}</Text>
                <Text style={[
                  styles.templateTitle,
                  selectedTemplate === template.id && styles.templateTitleSelected
                ]}>
                  {template.title}
                </Text>
                <Text style={[
                  styles.templateCategory,
                  selectedTemplate === template.id && styles.templateCategorySelected
                ]}>
                  {template.category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Bet Details Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BET DETAILS</Text>
          
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Bet Title *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter bet title"
              placeholderTextColor={colors.textMuted}
              value={betTitle}
              onChangeText={setBetTitle}
              maxLength={100}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Description *</Text>
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              placeholder="Describe your bet in detail"
              placeholderTextColor={colors.textMuted}
              value={betDescription}
              onChangeText={setBetDescription}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>

          <View style={styles.formRow}>
            <View style={styles.formGroupHalf}>
              <Text style={styles.fieldLabel}>Initial Amount *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="$0.00"
                placeholderTextColor={colors.textMuted}
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroupHalf}>
              <Text style={styles.fieldLabel}>Deadline (mins)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="30"
                placeholderTextColor={colors.textMuted}
                value={deadline}
                onChangeText={setDeadline}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Category Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CATEGORY</Text>
          <View style={styles.categoryGrid}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButton,
                  selectedCategory === category && styles.categoryButtonSelected
                ]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[
                  styles.categoryButtonText,
                  selectedCategory === category && styles.categoryButtonTextSelected
                ]}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Betting Sides */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>BETTING SIDES</Text>
            <View style={styles.switchContainer}>
              <Text style={styles.switchLabel}>Custom Odds</Text>
              <Switch
                value={customOdds}
                onValueChange={setCustomOdds}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.background}
              />
            </View>
          </View>
          
          <View style={styles.sidesContainer}>
            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Side A</Text>
              <TextInput
                style={styles.sideInput}
                placeholder="Side A Name"
                placeholderTextColor={colors.textMuted}
                value={sideAName}
                onChangeText={setSideAName}
              />
              {customOdds && (
                <TextInput
                  style={styles.oddsInput}
                  placeholder="-110"
                  placeholderTextColor={colors.textMuted}
                  value={oddsA}
                  onChangeText={setOddsA}
                  keyboardType="numeric"
                />
              )}
            </View>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Side B</Text>
              <TextInput
                style={styles.sideInput}
                placeholder="Side B Name"
                placeholderTextColor={colors.textMuted}
                value={sideBName}
                onChangeText={setSideBName}
              />
              {customOdds && (
                <TextInput
                  style={styles.oddsInput}
                  placeholder="+110"
                  placeholderTextColor={colors.textMuted}
                  value={oddsB}
                  onChangeText={setOddsB}
                  keyboardType="numeric"
                />
              )}
            </View>
          </View>
        </View>

        {/* Bet Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BET SETTINGS</Text>
          
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Private Bet</Text>
              <Text style={styles.settingDescription}>Only invited users can join</Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.background}
            />
          </View>
        </View>

        {/* Create Button */}
        <View style={styles.createButtonContainer}>
          <TouchableOpacity style={styles.createButton} onPress={handleCreateBet}>
            <Text style={styles.createButtonText}>CREATE BET</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
  },
  
  // Sections
  section: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.bold,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Templates
  templatesScroll: {
    marginVertical: spacing.sm,
  },
  templateCard: {
    width: 120,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginRight: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateCardSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  templateIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  templateTitle: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.medium,
  },
  templateTitleSelected: {
    color: colors.background,
  },
  templateCategory: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
  },
  templateCategorySelected: {
    color: colors.background,
  },

  // Form
  formGroup: {
    marginBottom: spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    // gap is not supported on native; use margins on children
  },
  formGroupHalf: {
    flex: 1,
    marginBottom: spacing.md,
    marginRight: spacing.sm,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.medium,
  },
  textInput: {
    ...commonStyles.textInput,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    textAlignVertical: 'center',
  },
  textAreaInput: {
    height: 80,
    textAlignVertical: 'top',
  },

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // gap is not supported on native; use margins on buttons
  },
  categoryButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  categoryButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryButtonText: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: typography.fontWeight.medium,
  },
  categoryButtonTextSelected: {
    color: colors.background,
  },

  // Switch
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // gap is not supported on native; use margin on label
  },
  switchLabel: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },

  // Betting Sides
  sidesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // gap is not supported on native; use margins on divider
  },
  sideCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sideLabel: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  sideInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    textAlignVertical: 'center',
  },
  oddsInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: typography.fontWeight.bold,
    textAlignVertical: 'center',
  },
  vsContainer: {
    width: 40,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  vsText: {
    ...textStyles.h4,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
  },

  // Settings
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  settingLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  settingDescription: {
    ...textStyles.caption,
    color: colors.textMuted,
  },

  // Create Button
  createButtonContainer: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.lg,
  },
});
