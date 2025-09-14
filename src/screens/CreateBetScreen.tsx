/**
 * Create Bet Screen
 * Professional bet creation interface with templates and bet types
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { useAuth } from '../contexts/AuthContext';

interface BetTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  sides: { sideAName: string; sideBName: string; };
}

// Initialize GraphQL client
const client = generateClient<Schema>();

export const CreateBetScreen: React.FC = () => {
  const { user } = useAuth();
  const [userBalance, setUserBalance] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [betTitle, setBetTitle] = useState('');
  const [betDescription, setBetDescription] = useState('');
  const [betAmount, setBetAmount] = useState('1');
  const [deadline, setDeadline] = useState('30');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('CUSTOM'); // Default to CUSTOM, set by templates
  const [sideAName, setSideAName] = useState('Yes');
  const [sideBName, setSideBName] = useState('No');
  const [isCreating, setIsCreating] = useState(false);

  // Fetch user balance
  useEffect(() => {
    const fetchUserBalance = async () => {
      if (!user) return;

      try {
        const { data: userData } = await client.models.User.get({ id: user.userId });
        if (userData) {
          setUserBalance(userData.balance || 0);
        }
      } catch (error) {
        console.error('Error fetching user balance:', error);
      }
    };

    fetchUserBalance();
  }, [user]);

  const betTemplates: BetTemplate[] = [
    {
      id: 'next-score',
      title: 'Next Score',
      description: 'Which team scores next?',
      category: 'SPORTS',
      icon: '🏀',
      sides: { sideAName: 'Home', sideBName: 'Away' },
    },
    {
      id: 'player-prop',
      title: 'Player Prop',
      description: 'Player performance bet',
      category: 'SPORTS',
      icon: '⭐',
      sides: { sideAName: 'Over', sideBName: 'Under' },
    },
    {
      id: 'yes-no',
      title: 'Yes/No Bet',
      description: 'Simple yes or no question',
      category: 'CUSTOM',
      icon: '❓',
      sides: { sideAName: 'Yes', sideBName: 'No' },
    },
    {
      id: 'weather',
      title: 'Weather Bet',
      description: 'Weather prediction bet',
      category: 'WEATHER',
      icon: '🌤️',
      sides: { sideAName: 'Rain', sideBName: 'No Rain' },
    },
    {
      id: 'entertainment',
      title: 'Entertainment',
      description: 'Entertainment event outcome',
      category: 'ENTERTAINMENT',
      icon: '🎬',
      sides: { sideAName: 'Winner A', sideBName: 'Winner B' },
    },
    {
      id: 'custom',
      title: 'Custom Bet',
      description: 'Create your own unique bet',
      category: 'CUSTOM',
      icon: '✨',
      sides: { sideAName: 'Side A', sideBName: 'Side B' },
    },
  ];

  const handleTemplateSelect = (template: BetTemplate) => {
    setSelectedTemplate(template.id);
    setBetTitle(template.title);
    setBetDescription(template.description);
    setSelectedCategory(template.category);
    setSideAName(template.sides.sideAName);
    setSideBName(template.sides.sideBName);
  };

  const handleAmountChange = (text: string) => {
    // Remove any non-numeric characters except decimal point
    const numericValue = text.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const parts = numericValue.split('.');
    const formattedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue;

    setBetAmount(formattedValue);
  };

  const handleCreateBet = async () => {
    if (!betTitle.trim() || !betDescription.trim() || !betAmount.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return;
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid bet amount.');
      return;
    }

    const deadlineMinutes = parseInt(deadline);
    if (isNaN(deadlineMinutes) || deadlineMinutes <= 0) {
      Alert.alert('Invalid Deadline', 'Please enter a valid deadline in minutes.');
      return;
    }

    setIsCreating(true);

    try {
      // Get current user
      const user = await getCurrentUser();

      // Calculate deadline timestamp
      const deadlineDate = new Date(Date.now() + deadlineMinutes * 60 * 1000);

      // Prepare odds object - stringify for GraphQL JSON field
      const oddsObject = JSON.stringify({
        sideAName: sideAName.trim(),
        sideBName: sideBName.trim(),
      });

      // Create bet via GraphQL API
      const result = await client.models.Bet.create({
        title: betTitle.trim(),
        description: betDescription.trim(),
        category: selectedCategory as Schema['Bet']['type']['category'],
        status: 'ACTIVE',
        creatorId: user.userId,
        totalPot: amount,
        betAmount: amount, // Store the individual bet amount for joining
        odds: oddsObject,
        deadline: deadlineDate.toISOString(),
      });

      console.log('GraphQL result:', result);

      if (result.data) {
        Alert.alert(
          'Bet Created!',
          `Your bet "${betTitle}" has been created successfully and is now live.`,
          [{ text: 'OK', onPress: resetForm }]
        );
      } else {
        console.error('GraphQL errors:', result.errors);
        throw new Error('Failed to create bet');
      }
    } catch (error) {
      console.error('Error creating bet:', error);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      Alert.alert(
        'Error',
        'Failed to create bet. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setSelectedTemplate(null);
    setBetTitle('');
    setBetDescription('');
    setBetAmount('');
    setDeadline('30');
    setIsPrivate(false);
    setSelectedCategory('CUSTOM');
    setSideAName('Yes');
    setSideBName('No');
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
        showBalance={true}
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
              <Text style={styles.fieldLabel}>Bet Amount*</Text>
              <TextInput
                style={styles.textInput}
                placeholder="$0.00"
                placeholderTextColor={colors.textMuted}
                value={betAmount}
                onChangeText={handleAmountChange}
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


        {/* Betting Sides */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BETTING SIDES</Text>
          <Text style={styles.sectionSubtitle}>Customize the two sides people can bet on</Text>

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
          <TouchableOpacity
            style={[
              styles.createButton,
              isCreating && styles.createButtonDisabled
            ]}
            onPress={handleCreateBet}
            disabled={isCreating}
            activeOpacity={isCreating ? 1 : 0.7}
          >
            {isCreating ? (
              <View style={styles.createButtonContent}>
                <ActivityIndicator size="small" color={colors.background} />
                <Text style={[styles.createButtonText, { marginLeft: spacing.sm }]}>
                  CREATING...
                </Text>
              </View>
            ) : (
              <Text style={styles.createButtonText}>CREATE BET</Text>
            )}
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
  createButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  createButtonContent: {
    flexDirection: 'row',
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
