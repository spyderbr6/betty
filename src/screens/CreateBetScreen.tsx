/**
 * Create Bet Screen
 * Professional bet creation interface with templates and bet types
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types/betting';
import { Ionicons } from '@expo/vector-icons';
import { NotificationService } from '../services/notificationService';
import { getProfilePictureUrl } from '../services/imageUploadService';
import { useEventCheckIn } from '../hooks/useEventCheckIn';

interface BetTemplate {
  id: string;
  displayName: string; // Name shown on template card
  category: string;
  icon: string;
  // Default values (auto-fill on template selection)
  defaultTitle?: string;
  defaultDescription?: string;
  // Placeholders (shown when field is empty/cleared)
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  sideAPlaceholder: string;
  sideBPlaceholder: string;
  // Smart defaults (only for locked fields like over/under sides)
  lockSides?: boolean;
  lockedSideA?: string;
  lockedSideB?: string;
}

// Initialize GraphQL client
const client = generateClient<Schema>();

export const CreateBetScreen: React.FC = () => {
  const { user } = useAuth();
  const { checkedInEvent } = useEventCheckIn();
  const scrollRef = React.useRef<ScrollView | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [betTitle, setBetTitle] = useState('');
  const [betDescription, setBetDescription] = useState('');
  const [betAmount, setBetAmount] = useState('1');
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [deadline, setDeadline] = useState('30');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('CUSTOM'); // Default to CUSTOM, set by templates
  const [sideAName, setSideAName] = useState('Yes');
  const [sideBName, setSideBName] = useState('No');
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Track if fields have been manually edited (for clear-on-focus behavior)
  const [titleEdited, setTitleEdited] = useState(false);
  const [descriptionEdited, setDescriptionEdited] = useState(false);

  // Friend selection state
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Fetch user friends - refresh on every screen focus
  const fetchFriends = useCallback(async () => {
    if (!user?.userId) return;

    try {
      // Fetch friendships where current user is user1 or user2
      const [friendships1, friendships2] = await Promise.all([
        client.models.Friendship.list({
          filter: { user1Id: { eq: user.userId } }
        }),
        client.models.Friendship.list({
          filter: { user2Id: { eq: user.userId } }
        })
      ]);

      const allFriendships = [...(friendships1.data || []), ...(friendships2.data || [])];

      // Get friend user IDs
      const friendIds = allFriendships.map(friendship =>
        friendship.user1Id === user.userId ? friendship.user2Id : friendship.user1Id
      );

      // Fetch friend user details with fresh signed URLs for profile pictures
      const friendUsers = await Promise.all(
        friendIds.map(async (friendId) => {
          try {
            const { data: userData } = await client.models.User.get({ id: friendId });
            if (userData) {
              // Get fresh signed URL for profile picture if it exists
              let profilePictureUrl = undefined;
              if (userData.profilePictureUrl) {
                const signedUrl = await getProfilePictureUrl(userData.profilePictureUrl);
                profilePictureUrl = signedUrl || undefined;
              }

              return {
                id: userData.id!,
                username: userData.username!,
                email: userData.email!,
                displayName: userData.displayName || undefined,
                profilePictureUrl: profilePictureUrl,
                balance: userData.balance || 0,
                trustScore: userData.trustScore || 5.0,
                totalBets: userData.totalBets || 0,
                totalWinnings: userData.totalWinnings || 0,
                winRate: userData.winRate || 0,
                createdAt: userData.createdAt || new Date().toISOString(),
                updatedAt: userData.updatedAt || new Date().toISOString(),
              } as User;
            }
            return null;
          } catch (error) {
            console.error(`Error fetching friend ${friendId}:`, error);
            return null;
          }
        })
      );

      const validFriends = friendUsers.filter((friend): friend is User => friend !== null);
      setFriends(validFriends);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  }, [user?.userId]);

  // Refresh friend list every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchFriends();
    }, [fetchFriends])
  );

  const betTemplates: BetTemplate[] = [
    {
      id: 'next-score',
      displayName: 'Next Score',
      category: 'SPORTS',
      icon: '🏀',
      defaultTitle: 'Next Score',
      defaultDescription: 'Which team scores next?',
      titlePlaceholder: 'e.g., Who scores the next basket?',
      descriptionPlaceholder: 'Which team will score the next points?',
      sideAPlaceholder: 'Home Team',
      sideBPlaceholder: 'Away Team',
    },
    {
      id: 'player-prop',
      displayName: 'Player Prop',
      category: 'SPORTS',
      icon: '⭐',
      defaultTitle: 'Player Prop',
      defaultDescription: 'Player performance bet',
      titlePlaceholder: 'e.g., LeBron 30+ points',
      descriptionPlaceholder: 'Will the player achieve this stat line?',
      sideAPlaceholder: 'Over',
      sideBPlaceholder: 'Under',
    },
    {
      id: 'over-under',
      displayName: 'Over/Under',
      category: 'SPORTS',
      icon: '📊',
      // No defaults - user must specify the target value
      titlePlaceholder: 'e.g., National Anthem Length',
      descriptionPlaceholder: 'e.g., 4 minutes, 50 points, 3.5 goals',
      sideAPlaceholder: 'Over',
      sideBPlaceholder: 'Under',
      lockSides: true,
      lockedSideA: 'Over',
      lockedSideB: 'Under',
    },
    {
      id: 'yes-no',
      displayName: 'Yes/No Bet',
      category: 'CUSTOM',
      icon: '❓',
      // No defaults - user must specify the question
      titlePlaceholder: 'e.g., Will it rain tomorrow?',
      descriptionPlaceholder: 'Describe the yes/no question',
      sideAPlaceholder: 'Yes',
      sideBPlaceholder: 'No',
      lockSides: true,
      lockedSideA: 'Yes',
      lockedSideB: 'No',
    },
    {
      id: 'custom',
      displayName: 'Custom Bet',
      category: 'CUSTOM',
      icon: '✨',
      // No defaults - fully custom bet
      titlePlaceholder: 'Enter your bet title',
      descriptionPlaceholder: 'Describe what you\'re betting on',
      sideAPlaceholder: 'Option A',
      sideBPlaceholder: 'Option B',
    },
  ];

  // Default the first bet type/template on initial load
  useEffect(() => {
    handleTemplateSelect(betTemplates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTemplateSelect = (template: BetTemplate) => {
    setSelectedTemplate(template.id);
    setSelectedCategory(template.category);

    // Set default values (if provided), otherwise empty for placeholders
    setBetTitle(template.defaultTitle || '');
    setBetDescription(template.defaultDescription || '');

    // Reset edited flags when template changes
    setTitleEdited(false);
    setDescriptionEdited(false);

    // Handle side names with smart defaults
    if (template.lockSides) {
      // Locked sides (over/under, yes/no) - always use locked values
      setSideAName(template.lockedSideA || '');
      setSideBName(template.lockedSideB || '');
    } else if (checkedInEvent && template.category === 'SPORTS') {
      // Event check-in: use team names for sports bets
      setSideAName(checkedInEvent.homeTeam);
      setSideBName(checkedInEvent.awayTeam);
    } else {
      // Empty fields - use placeholders
      setSideAName('');
      setSideBName('');
    }
  };

  const handleAmountChange = (text: string) => {
    // Remove any non-numeric characters except decimal point
    const numericValue = text.replace(/[^0-9.]/g, '');

    // Prevent multiple decimal points
    const parts = numericValue.split('.');
    const formattedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue;

    setBetAmount(formattedValue);
  };

  // Display value with currency formatting when not focused
  const displayAmount = (() => {
    if (isAmountFocused) return betAmount;
    if (!betAmount) return '';
    const n = parseFloat(betAmount);
    if (isNaN(n)) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  })();

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

    if (!selectedSide) {
      Alert.alert('Pick a Side', 'Please choose Side A or Side B to join your bet.');
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

      // Check user balance before creating bet
      const { data: userData } = await client.models.User.get({ id: user.userId });
      const currentBalance = userData?.balance || 0;

      if (currentBalance < amount) {
        Alert.alert(
          'Insufficient Funds',
          `You need $${amount.toFixed(2)} to create this bet, but you only have $${currentBalance.toFixed(2)}. Please add funds to your account.`
        );
        setIsCreating(false);
        return;
      }

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
        // Immediately join the bet as the creator on the selected side
        try {
          await client.models.Participant.create({
            betId: result.data.id!,
            userId: user.userId,
            side: selectedSide,
            amount: amount,
            status: 'ACCEPTED',
            payout: 0,
            joinedAt: new Date().toISOString(),
          });
        } catch (joinErr) {
          console.error('Error creating participant for new bet:', joinErr);
          // Continue; the bet is created even if auto-join failed
        }

        // Send invitations to selected friends
        if (selectedFriends.size > 0 && result.data) {
          try {
            // Fetch current user's display name from database
            const { data: currentUserData } = await client.models.User.get({ id: user.userId });
            const currentUserDisplayName = currentUserData?.displayName || currentUserData?.username || user.username;
            const betId = result.data.id!;
            const invitationPromises = Array.from(selectedFriends).map(async (friendId) => {
              try {
                // Create bet invitation (without specific side requirement)
                await client.models.BetInvitation.create({
                  betId: betId,
                  fromUserId: user.userId,
                  toUserId: friendId,
                  status: 'PENDING',
                  invitedSide: '', // Empty string since they can choose their own side
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
                });

                // Send notification to friend
                await NotificationService.notifyBetInvitationReceived(
                  friendId,
                  currentUserDisplayName,
                  betTitle.trim(),
                  user.userId,
                  betId,
                  `${betId}-${friendId}` // Simple invitation ID
                );
              } catch (inviteError) {
                console.error(`Error sending invitation to friend ${friendId}:`, inviteError);
                // Continue with other invitations even if one fails
              }
            });

            await Promise.all(invitationPromises);
            console.log(`Sent ${selectedFriends.size} bet invitations`);
          } catch (error) {
            console.error('Error sending friend invitations:', error);
            // Don't block the success flow if invitations fail
          }
        }

        // Scroll to top and reset form immediately after successful creation
        scrollRef.current?.scrollTo({ y: 0, animated: true });

        // Show toast notification
        const sideChosen = selectedSide === 'A' ? sideAName : sideBName;
        setToastMessage(`Bet "${betTitle}" created! You joined on "${sideChosen}"`);
        setShowToast(true);

        // Hide toast after 3 seconds
        setTimeout(() => {
          setShowToast(false);
        }, 3000);

        resetForm();
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
    // Clear selection first so subsequent apply visibly re-selects the template
    setSelectedTemplate(null);

    // Restore primitive defaults
    setBetTitle('');
    setBetDescription('');
    setBetAmount('1');
    setIsAmountFocused(false);
    setDeadline('30');
    setIsPrivate(false);
    setSelectedSide(null);
    setSelectedFriends(new Set()); // Clear selected friends

    // Re-apply the first template defaults (title, description, category, sides)
    // on the next tick to avoid state batching preserving stale values
    setTimeout(() => {
      handleTemplateSelect(betTemplates[0]);
    }, 0);
  };

  const handleBalancePress = () => {
    console.log('Balance pressed');
  };

  // Removed - Header handles notifications internally now

  // Friend selection helpers
  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => {
      const newSet = new Set(prev);
      if (newSet.has(friendId)) {
        newSet.delete(friendId);
      } else {
        newSet.add(friendId);
      }
      return newSet;
    });
  };

  const generateAvatarInitials = (friend: User) => {
    const nameForAvatar = friend.displayName || friend.username || friend.email.split('@')[0];
    return nameForAvatar
      .split(/[\s_.]/)
      .map(part => part[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 2) || '??';
  };

  const getTopFriends = () => {
    // Return top 4 friends for quick selection
    return friends.slice(0, 4);
  };

  // Get current template for dynamic placeholders
  const currentTemplate = betTemplates.find(t => t.id === selectedTemplate) || betTemplates[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        onBalancePress={handleBalancePress}
        variant="default"
      />

      {/* Toast Banner */}
      {showToast && (
        <View style={styles.toastBanner}>
          <Ionicons name="checkmark-circle" size={20} color={colors.background} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      <ScrollView ref={scrollRef} style={styles.content} showsVerticalScrollIndicator={false}>
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
                  {template.displayName}
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
              placeholder={currentTemplate.titlePlaceholder}
              placeholderTextColor={colors.textMuted}
              value={betTitle}
              onChangeText={setBetTitle}
              onFocus={() => {
                // Clear default value on first focus
                if (!titleEdited && betTitle === currentTemplate.defaultTitle) {
                  setBetTitle('');
                }
                setTitleEdited(true);
              }}
              maxLength={100}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>
              {selectedTemplate === 'over-under' ? 'Target Value *' : 'Description *'}
            </Text>
            <TextInput
              style={[styles.textInput, selectedTemplate !== 'over-under' && styles.textAreaInput]}
              placeholder={currentTemplate.descriptionPlaceholder}
              placeholderTextColor={colors.textMuted}
              value={betDescription}
              onChangeText={setBetDescription}
              onFocus={() => {
                // Clear default value on first focus
                if (!descriptionEdited && betDescription === currentTemplate.defaultDescription) {
                  setBetDescription('');
                }
                setDescriptionEdited(true);
              }}
              multiline={selectedTemplate !== 'over-under'}
              numberOfLines={selectedTemplate !== 'over-under' ? 3 : 1}
              maxLength={selectedTemplate === 'over-under' ? 50 : 500}
            />
            {selectedTemplate === 'over-under' && (
              <Text style={styles.fieldHint}>
                This is the value that bettors will choose "Over" or "Under" on
              </Text>
            )}
          </View>

          <View style={styles.formRow}>
            <View style={styles.formGroupHalf}>
              <Text style={styles.fieldLabel}>Bet Amount*</Text>
              <TextInput
                style={styles.textInput}
                placeholder="$0.00"
                placeholderTextColor={colors.textMuted}
                value={displayAmount}
                onChangeText={handleAmountChange}
                keyboardType="numeric"
                onFocus={() => setIsAmountFocused(true)}
                onBlur={() => {
                  setIsAmountFocused(false);
                  if (betAmount) {
                    const n = parseFloat(betAmount);
                    if (!isNaN(n)) setBetAmount(n.toFixed(2));
                  }
                }}
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
          <Text style={styles.sectionSubtitle}>
            {currentTemplate.lockSides
              ? `Sides are locked to "${currentTemplate.lockedSideA}" and "${currentTemplate.lockedSideB}" for this bet type`
              : 'Customize the two sides people can bet on'}
          </Text>

          <View style={styles.sidesContainer}>
            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Side A</Text>
              <TextInput
                style={styles.sideInput}
                placeholder={currentTemplate.sideAPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={sideAName}
                onChangeText={setSideAName}
                editable={!currentTemplate.lockSides}
              />
            </View>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <View style={styles.sideCard}>
              <Text style={styles.sideLabel}>Side B</Text>
              <TextInput
                style={styles.sideInput}
                placeholder={currentTemplate.sideBPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={sideBName}
                onChangeText={setSideBName}
                editable={!currentTemplate.lockSides}
              />
            </View>
          </View>

          {/* Choose your side */}
          <View style={{ marginTop: spacing.sm }}>
            <Text style={styles.sideLabel}>Choose your side to join *</Text>
            <View style={styles.sideSelectContainer}>
              <TouchableOpacity
                style={[styles.sideOption, selectedSide === 'A' && styles.sideOptionSelected]}
                onPress={() => setSelectedSide('A')}
                activeOpacity={0.8}
              >
                <Text style={[styles.sideOptionText, selectedSide === 'A' && styles.sideOptionTextSelected]}>
                  {sideAName || 'Side A'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideOption, selectedSide === 'B' && styles.sideOptionSelected]}
                onPress={() => setSelectedSide('B')}
                activeOpacity={0.8}
              >
                <Text style={[styles.sideOptionText, selectedSide === 'B' && styles.sideOptionTextSelected]}>
                  {sideBName || 'Side B'}
                </Text>
              </TouchableOpacity>
            </View>
            {!selectedSide && (
              <Text style={styles.sideHint}>You must pick a side before creating the bet.</Text>
            )}
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

        {/* Friend Invitations Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INVITE FRIENDS</Text>
          <Text style={styles.sectionSubtitle}>Select friends to invite to this bet</Text>

          {friends.length > 0 ? (
            <>
              {/* Top Friends Quick Selection */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendsScroll}>
                {getTopFriends().map((friend) => (
                  <TouchableOpacity
                    key={friend.id}
                    style={[
                      styles.friendAvatar,
                      selectedFriends.has(friend.id) && styles.friendAvatarSelected
                    ]}
                    onPress={() => toggleFriendSelection(friend.id)}
                    activeOpacity={0.7}
                  >
                    {friend.profilePictureUrl ? (
                      <Image source={{ uri: friend.profilePictureUrl }} style={styles.friendImage} />
                    ) : (
                      <View style={[styles.friendPlaceholder, selectedFriends.has(friend.id) && styles.friendPlaceholderSelected]}>
                        <Text style={[styles.friendInitials, selectedFriends.has(friend.id) && styles.friendInitialsSelected]}>
                          {generateAvatarInitials(friend)}
                        </Text>
                      </View>
                    )}
                    {selectedFriends.has(friend.id) && (
                      <View style={styles.friendSelectedBadge}>
                        <Ionicons name="checkmark" size={12} color={colors.background} />
                      </View>
                    )}
                    <Text style={styles.friendName} numberOfLines={1}>
                      {friend.displayName || friend.username || friend.email.split('@')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Selected Friends Count */}
              {selectedFriends.size > 0 && (
                <View style={styles.selectedFriendsInfo}>
                  <Ionicons name="people" size={16} color={colors.primary} />
                  <Text style={styles.selectedFriendsText}>
                    {selectedFriends.size} friend{selectedFriends.size !== 1 ? 's' : ''} selected
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.noFriendsContainer}>
              <Ionicons name="people-outline" size={32} color={colors.textMuted} />
              <Text style={styles.noFriendsText}>No friends to invite</Text>
              <Text style={styles.noFriendsSubtext}>Add friends to invite them to your bets</Text>
            </View>
          )}
        </View>

        {/* Create Button */}
        <View style={styles.createButtonContainer}>
          {/** Disable if creating or no side selected */}
          {(() => { const disabled = isCreating || !selectedSide; return (
          <TouchableOpacity
            style={[
              styles.createButton,
              (disabled) && styles.createButtonDisabled
            ]}
            onPress={handleCreateBet}
            disabled={disabled}
            activeOpacity={disabled ? 1 : 0.7}
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
          ); })()}
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
  fieldHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontSize: 11,
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
  // Side choose UI
  sideSelectContainer: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  sideOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  sideOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sideOptionText: {
    ...textStyles.button,
    color: colors.textSecondary,
  },
  sideOptionTextSelected: {
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  sideHint: {
    ...textStyles.caption,
    color: colors.warning,
    marginTop: spacing.xs,
  },

  // Friend Selection Styles
  friendsScroll: {
    marginTop: spacing.md,
  },
  friendAvatar: {
    alignItems: 'center',
    marginRight: spacing.md,
    width: 60,
  },
  friendAvatarSelected: {
    // No additional styling needed, handled by badge
  },
  friendImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.border,
  },
  friendPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  friendPlaceholderSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
  },
  friendInitials: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
    fontSize: 14,
  },
  friendInitialsSelected: {
    color: colors.background,
  },
  friendSelectedBadge: {
    position: 'absolute',
    top: -2,
    right: 5,
    backgroundColor: colors.success,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  friendName: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    maxWidth: 60,
  },
  seeMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 60,
  },
  seeMoreIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeMoreText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    maxWidth: 60,
  },
  selectedFriendsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
  },
  selectedFriendsText: {
    ...textStyles.caption,
    color: colors.primary,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.medium,
  },
  noFriendsContainer: {
    alignItems: 'center',
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  noFriendsText: {
    ...textStyles.button,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },
  noFriendsSubtext: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // Toast Banner
  toastBanner: {
    backgroundColor: colors.success,
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: spacing.radius.sm,
    ...commonStyles.flexCenter,
  },
  toastText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    flex: 1,
  },
});
