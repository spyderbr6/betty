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
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { TransactionService } from '../services/transactionService';
import { getProfilePictureUrl } from '../services/imageUploadService';
import { useEventCheckIn } from '../hooks/useEventCheckIn';
import { showAlert } from '../components/ui/CustomAlert';
import { SquaresGameService } from '../services/squaresGameService';
import { EventPickerModal } from '../components/modals/EventPickerModal';
import { FriendSelector } from '../components/ui/FriendSelector';

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
  const insets = useSafeAreaInsets();
  const { checkedInEvent } = useEventCheckIn();
  const scrollRef = React.useRef<ScrollView | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [betTitle, setBetTitle] = useState('');
  const [betDescription, setBetDescription] = useState('');
  const [betAmount, setBetAmount] = useState('1');
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [deadline, setDeadline] = useState('30');
  const [isPrivate, setIsPrivate] = useState(true); // Default to private for squares
  const [selectedCategory, setSelectedCategory] = useState('CUSTOM'); // Default to CUSTOM, set by templates
  const [sideAName, setSideAName] = useState('Yes');
  const [sideBName, setSideBName] = useState('No');
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Track if fields have been manually edited (for clear-on-focus behavior)
  const [titleEdited, setTitleEdited] = useState(false);
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [sideAEdited, setSideAEdited] = useState(false);
  const [sideBEdited, setSideBEdited] = useState(false);

  // Friend selection state
  const [friends, setFriends] = useState<User[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  // Squares-specific state
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [pricePerSquare, setPricePerSquare] = useState('10.00');
  const [isPriceFocused, setIsPriceFocused] = useState(false);
  const [squaresDescription, setSquaresDescription] = useState('');
  const [period1Payout, setPeriod1Payout] = useState(15);
  const [period2Payout, setPeriod2Payout] = useState(25);
  const [period3Payout, setPeriod3Payout] = useState(15);
  const [period4Payout, setPeriod4Payout] = useState(45);

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
      id: 'squares',
      displayName: 'Betting Squares',
      category: 'SPORTS',
      icon: '🎲',
      titlePlaceholder: '',
      descriptionPlaceholder: '',
      sideAPlaceholder: '',
      sideBPlaceholder: '',
    },
    {
      id: 'player-prop',
      displayName: 'Player Prop',
      category: 'SPORTS',
      icon: '⭐',
      titlePlaceholder: 'e.g., Mahomes throws 3+ TDs',
      descriptionPlaceholder: 'Define the player achievement or stat line',
      sideAPlaceholder: 'Achieves',
      sideBPlaceholder: 'Falls Short',
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

  // Update side names when checked-in event changes
  useEffect(() => {
    if (selectedTemplate) {
      const currentTemplate = betTemplates.find(t => t.id === selectedTemplate);

      if (currentTemplate) {
        if (checkedInEvent && currentTemplate.category === 'SPORTS' && !currentTemplate.lockSides && currentTemplate.id !== 'player-prop') {
          // Update side names with checked-in event team names
          setSideAName(checkedInEvent.homeTeam);
          setSideBName(checkedInEvent.awayTeam);
          setSideAEdited(true);
          setSideBEdited(true);
        } else if (!checkedInEvent && !currentTemplate.lockSides) {
          // Reset to default placeholders when checked out (but not for locked sides)
          setSideAName(currentTemplate.sideAPlaceholder || 'Yes');
          setSideBName(currentTemplate.sideBPlaceholder || 'No');
          setSideAEdited(false);
          setSideBEdited(false);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedInEvent, selectedTemplate]);

  const handleTemplateSelect = (template: BetTemplate) => {
    setSelectedTemplate(template.id);
    setSelectedCategory(template.category);

    // Set default values (if provided), otherwise empty for placeholders
    setBetTitle(template.defaultTitle || '');
    setBetDescription(template.defaultDescription || '');

    // Reset edited flags when template changes
    setTitleEdited(false);
    setDescriptionEdited(false);
    setSideAEdited(false);
    setSideBEdited(false);

    // Handle side names with smart defaults
    if (template.lockSides) {
      // Locked sides (over/under, yes/no) - always use locked values, mark as edited so they don't clear
      setSideAName(template.lockedSideA || '');
      setSideBName(template.lockedSideB || '');
      setSideAEdited(true);
      setSideBEdited(true);
    } else if (checkedInEvent && template.category === 'SPORTS' && template.id !== 'player-prop') {
      // Event check-in: use team names for sports bets (except player props), mark as edited so they don't clear
      setSideAName(checkedInEvent.homeTeam);
      setSideBName(checkedInEvent.awayTeam);
      setSideAEdited(true);
      setSideBEdited(true);
    } else {
      // Default values that will clear on first focus
      setSideAName(template.sideAPlaceholder || 'Yes');
      setSideBName(template.sideBPlaceholder || 'No');
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
    // Branch based on bet type
    if (selectedTemplate === 'squares') {
      return handleCreateSquares();
    }

    // Standard bet validation
    if (!betTitle.trim() || !betDescription.trim() || !betAmount.trim()) {
      showAlert('Missing Information', 'Please fill in all required fields.');
      return;
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid bet amount.');
      return;
    }

    if (!selectedSide) {
      showAlert('Pick a Side', 'Please choose Side A or Side B to join your bet.');
      return;
    }

    const deadlineMinutes = parseInt(deadline);
    if (isNaN(deadlineMinutes) || deadlineMinutes <= 0) {
      showAlert('Invalid Deadline', 'Please enter a valid deadline in minutes.');
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
        showAlert(
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
        isPrivate: isPrivate, // Pass the private bet setting
      });

      console.log('GraphQL result:', result);

      if (result.data) {
        // Immediately join the bet as the creator on the selected side
        try {
          const participantResult = await client.models.Participant.create({
            betId: result.data.id!,
            userId: user.userId,
            side: selectedSide,
            amount: amount,
            status: 'ACCEPTED',
            payout: 0,
            joinedAt: new Date().toISOString(),
          });

          if (participantResult.data) {
            // Record transaction for bet placement (this handles balance deduction automatically)
            const creatorSideName = selectedSide === 'A' ? sideAName.trim() : sideBName.trim();
            const transaction = await TransactionService.recordBetPlacement(
              user.userId,
              amount,
              result.data.id!,
              participantResult.data.id,
              betTitle.trim(),
              creatorSideName
            );

            if (!transaction) {
              console.error('Failed to record transaction for creator joining bet');
              // Rollback participant creation if transaction fails
              await client.models.Participant.delete({ id: participantResult.data.id });
              throw new Error('Failed to record transaction for bet creation');
            }
          }
        } catch (joinErr) {
          console.error('Error creating participant for new bet:', joinErr);
          // Rollback bet creation if participant/transaction creation fails
          await client.models.Bet.delete({ id: result.data.id! });
          throw joinErr;
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
      showAlert(
        'Error',
        'Failed to create bet. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateSquares = async () => {
    if (!user) return;

    // Validate selectedEvent
    if (!selectedEvent?.id) {
      showAlert('No Event Selected', 'Please select an event for your squares game.');
      return;
    }

    setIsCreating(true);

    try {
      const price = parseFloat(pricePerSquare);

      // Validate price
      if (isNaN(price) || price < 1 || price > 100) {
        showAlert('Invalid Price', 'Price per square must be between $1 and $100.');
        setIsCreating(false);
        return;
      }

      // Create payout structure (convert percentages to decimals)
      const payoutStructure = {
        period1: period1Payout / 100,
        period2: period2Payout / 100,
        period3: period3Payout / 100,
        period4: period4Payout / 100,
      };

      console.log('[CreateSquares] Creating game with:', {
        eventId: selectedEvent.id,
        price,
        payoutStructure,
        eventTitle: `${selectedEvent.awayTeamCode || selectedEvent.awayTeam} @ ${selectedEvent.homeTeamCode || selectedEvent.homeTeam}`,
      });

      // Create squares game (service returns full game object)
      const game = await SquaresGameService.createSquaresGame({
        creatorId: user.userId,
        eventId: selectedEvent.id,
        title: `${selectedEvent.awayTeamCode || selectedEvent.awayTeam} @ ${selectedEvent.homeTeamCode || selectedEvent.homeTeam} Squares`,
        description: squaresDescription.trim() || undefined,
        pricePerSquare: price,
        payoutStructure,
        isPrivate,
      });

      if (game?.id) {
        console.log('[CreateSquares] Successfully created game:', game.id);

        // Scroll to top and show toast
        scrollRef.current?.scrollTo({ y: 0, animated: true });

        setToastMessage('Squares game created! Start selling squares to fill the grid.');
        setShowToast(true);

        setTimeout(() => {
          setShowToast(false);
        }, 3000);

        // Reset squares form
        setSelectedEvent(null);
        setPricePerSquare('10.00');
        setSquaresDescription('');
        setPeriod1Payout(15);
        setPeriod2Payout(25);
        setPeriod3Payout(15);
        setPeriod4Payout(45);
        setIsPrivate(false);
        setSelectedFriends(new Set());
      } else {
        throw new Error('Game creation returned invalid response');
      }
    } catch (error: any) {
      console.error('[CreateSquares] Error creating squares game:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      showAlert(
        'Error',
        `Failed to create squares game: ${errorMessage}`,
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

      <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={{ paddingBottom: spacing.navigation.baseHeight + insets.bottom }} showsVerticalScrollIndicator={false}>
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

        {/* Conditional Form: Standard Bet or Betting Squares */}
        {selectedTemplate === 'squares' ? (
          /* ===== BETTING SQUARES FORM ===== */
          <>
            {/* Event Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SELECT EVENT</Text>
              <Text style={styles.sectionSubtitle}>Choose a live event for your squares game</Text>

              {selectedEvent ? (
                <TouchableOpacity
                  style={styles.selectedEventCard}
                  onPress={() => setShowEventPicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventCardContent}>
                    <View style={styles.eventTeams}>
                      <Text style={styles.eventTeamText}>
                        {selectedEvent.awayTeamCode || selectedEvent.awayTeam}
                      </Text>
                      <Text style={styles.eventVsText}>@</Text>
                      <Text style={styles.eventTeamText}>
                        {selectedEvent.homeTeamCode || selectedEvent.homeTeam}
                      </Text>
                    </View>
                    <Text style={styles.eventTime}>
                      {new Date(selectedEvent.scheduledTime).toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.selectEventButton}
                  onPress={() => setShowEventPicker(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar" size={24} color={colors.primary} />
                  <Text style={styles.selectEventText}>Tap to Select Event</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Price Per Square */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PRICE PER SQUARE</Text>
              <Text style={styles.sectionSubtitle}>Set the price for each square ($5 - $100)</Text>

              <TextInput
                style={[styles.priceInput, styles.textInput]}
                placeholder="$0.00"
                placeholderTextColor={colors.textMuted}
                value={isPriceFocused ? pricePerSquare : `$${parseFloat(pricePerSquare || '0').toFixed(2)}`}
                onChangeText={(text) => {
                  const numericValue = text.replace(/[^0-9.]/g, '');
                  const parts = numericValue.split('.');
                  const formattedValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue;
                  setPricePerSquare(formattedValue);
                }}
                keyboardType="numeric"
                onFocus={() => setIsPriceFocused(true)}
                onBlur={() => {
                  setIsPriceFocused(false);
                  if (pricePerSquare) {
                    const n = parseFloat(pricePerSquare);
                    if (!isNaN(n)) setPricePerSquare(n.toFixed(2));
                  }
                }}
              />
              <Text style={styles.fieldHint}>
                Total pot will be ${(parseFloat(pricePerSquare || '0') * 100).toFixed(2)} (100 squares)
              </Text>
            </View>

            {/* Payout Structure */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>PAYOUT STRUCTURE</Text>
                  <Text style={styles.sectionSubtitle}>Percentage for each period (must total 100%)</Text>
                </View>
                <View style={[
                  styles.payoutTotalBadge,
                  (period1Payout + period2Payout + period3Payout + period4Payout) === 100
                    ? styles.payoutTotalValid
                    : styles.payoutTotalInvalid
                ]}>
                  <Text style={styles.payoutTotalText}>
                    {period1Payout + period2Payout + period3Payout + period4Payout}%
                  </Text>
                </View>
              </View>

              {[
                { label: 'Period 1', value: period1Payout, setter: setPeriod1Payout },
                { label: 'Period 2 (Halftime)', value: period2Payout, setter: setPeriod2Payout },
                { label: 'Period 3', value: period3Payout, setter: setPeriod3Payout },
                { label: 'Period 4 (Final)', value: period4Payout, setter: setPeriod4Payout },
              ].map((period, index) => (
                <View key={index} style={styles.payoutRow}>
                  <Text style={styles.payoutLabel}>{period.label}: {period.value}%</Text>
                  <View style={styles.payoutControls}>
                    <TouchableOpacity
                      style={styles.payoutButton}
                      onPress={() => period.setter(Math.max(0, period.value - 5))}
                    >
                      <Ionicons name="remove" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.payoutInput}
                      value={period.value.toString()}
                      onChangeText={(text) => {
                        const val = parseInt(text) || 0;
                        period.setter(Math.max(0, Math.min(100, val)));
                      }}
                      keyboardType="numeric"
                      maxLength={3}
                    />
                    <TouchableOpacity
                      style={styles.payoutButton}
                      onPress={() => period.setter(Math.min(100, period.value + 5))}
                    >
                      <Ionicons name="add" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Optional Description */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Add any additional details or rules..."
                placeholderTextColor={colors.textMuted}
                value={squaresDescription}
                onChangeText={setSquaresDescription}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
            </View>
          </>
        ) : (
          /* ===== STANDARD BET FORM ===== */
          <>
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
              : 'Customize the two sides and choose which one you want to join'}
          </Text>

          <View style={styles.sidesContainer}>
            <TouchableOpacity
              style={[
                styles.sideCard,
                selectedSide === 'A' && styles.sideCardSelected
              ]}
              onPress={() => setSelectedSide('A')}
              activeOpacity={0.9}
            >
              <Text style={[
                styles.sideLabel,
                selectedSide === 'A' && styles.sideLabelSelected
              ]}>
                Side A {selectedSide === 'A' && '✓'}
              </Text>
              <TextInput
                style={[
                  styles.sideInput,
                  selectedSide === 'A' && styles.sideInputSelected
                ]}
                placeholder={currentTemplate.sideAPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={sideAName}
                onChangeText={setSideAName}
                onFocus={() => {
                  // Clear default value on first focus (but not team names or locked sides)
                  if (!sideAEdited && sideAName === (currentTemplate.sideAPlaceholder || 'Yes')) {
                    setSideAName('');
                  }
                  setSideAEdited(true);
                }}
                editable={!currentTemplate.lockSides}
              />
            </TouchableOpacity>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.sideCard,
                selectedSide === 'B' && styles.sideCardSelected
              ]}
              onPress={() => setSelectedSide('B')}
              activeOpacity={0.9}
            >
              <Text style={[
                styles.sideLabel,
                selectedSide === 'B' && styles.sideLabelSelected
              ]}>
                Side B {selectedSide === 'B' && '✓'}
              </Text>
              <TextInput
                style={[
                  styles.sideInput,
                  selectedSide === 'B' && styles.sideInputSelected
                ]}
                placeholder={currentTemplate.sideBPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={sideBName}
                onChangeText={setSideBName}
                onFocus={() => {
                  // Clear default value on first focus (but not team names or locked sides)
                  if (!sideBEdited && sideBName === (currentTemplate.sideBPlaceholder || 'No')) {
                    setSideBName('');
                  }
                  setSideBEdited(true);
                }}
                editable={!currentTemplate.lockSides}
              />
            </TouchableOpacity>
          </View>

          {!selectedSide && (
            <Text style={styles.sideHint}>Tap a side to select it before creating the bet.</Text>
          )}
        </View>

          </>
        )}
        {/* End of conditional form */}

        {/* Bet Settings - Shared by both bet types */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SETTINGS</Text>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Private {selectedTemplate === 'squares' ? 'Game' : 'Bet'}</Text>
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

        {/* Friend Invitations Section - Shared by both bet types */}
        <FriendSelector
          friends={friends}
          selectedFriends={selectedFriends}
          onToggleFriend={toggleFriendSelection}
          maxDisplay={10}
          label="INVITE FRIENDS"
          sublabel={`Select friends to invite to this ${selectedTemplate === 'squares' ? 'game' : 'bet'}`}
        />

        {/* Create Button */}
        <View style={styles.createButtonContainer}>
          {(() => {
            const isSquaresMode = selectedTemplate === 'squares';
            const disabled = isCreating || (
              isSquaresMode
                ? !selectedEvent || (period1Payout + period2Payout + period3Payout + period4Payout) !== 100
                : !selectedSide
            );
            return (
              <TouchableOpacity
                style={[
                  styles.createButton,
                  disabled && styles.createButtonDisabled
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
                  <Text style={styles.createButtonText}>
                    {isSquaresMode ? 'CREATE SQUARES GAME' : 'CREATE BET'}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })()}
        </View>
      </ScrollView>

      {/* Event Picker Modal for Squares */}
      {showEventPicker && (
        <EventPickerModal
          visible={showEventPicker}
          onSelect={(event) => {
            setSelectedEvent(event);
            setShowEventPicker(false);
          }}
          onClose={() => setShowEventPicker(false)}
        />
      )}
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
    borderWidth: 2,
    borderColor: colors.border,
  },
  sideCardSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sideLabel: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textAlign: 'center',
    fontWeight: typography.fontWeight.medium,
  },
  sideLabelSelected: {
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  sideInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    textAlignVertical: 'center',
  },
  sideInputSelected: {
    backgroundColor: colors.background,
    borderColor: colors.primary,
    borderWidth: 2,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
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
    width: 32,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
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
  sideHint: {
    ...textStyles.caption,
    color: colors.warning,
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

  // Squares-specific styles
  selectedEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  eventCardContent: {
    flex: 1,
  },
  eventTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  eventTeamText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  eventVsText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  eventTime: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  selectEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  selectEventText: {
    ...textStyles.body,
    color: colors.primary,
    marginLeft: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },
  priceInput: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  payoutTotalBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    minWidth: 60,
    alignItems: 'center',
  },
  payoutTotalValid: {
    backgroundColor: colors.success,
  },
  payoutTotalInvalid: {
    backgroundColor: colors.error,
  },
  payoutTotalText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  payoutLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },
  payoutControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payoutButton: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  payoutInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginHorizontal: spacing.sm,
    width: 50,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    textAlignVertical: 'center',
  },
});
