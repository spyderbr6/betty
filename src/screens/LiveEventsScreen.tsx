/**
 * Live Events Screen
 * Screen for live betting events and real-time bets
 */

import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, commonStyles, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { LiveBetCard } from '../components/betting/LiveBetCard';
import { Bet } from '../types/betting';

// Mock live bets data
const mockLiveBets: Bet[] = [
  {
    id: 'live1',
    title: 'Next 3PT Made',
    description: 'LeBron James makes next 3-point attempt',
    category: 'SPORTS',
    status: 'LIVE',
    creatorId: 'user1',
    totalPot: 50,
    odds: {
      sideA: -110,
      sideB: +150,
      sideAName: 'Yes',
      sideBName: 'No',
    },
    deadline: new Date(Date.now() + 300000).toISOString(), // 5 minutes from now
    createdAt: new Date(Date.now() - 600000).toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [
      { 
        id: '1', 
        betId: 'live1', 
        userId: 'user1', 
        side: 'A', 
        amount: 25, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
      { 
        id: '2', 
        betId: 'live1', 
        userId: 'user2', 
        side: 'B', 
        amount: 25, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
    ],
  },
  {
    id: 'live2',
    title: 'Next Timeout Called',
    description: 'Which team calls the next timeout?',
    category: 'SPORTS',
    status: 'LIVE',
    creatorId: 'user2',
    totalPot: 75,
    odds: {
      sideA: +120,
      sideB: -140,
      sideAName: 'Lakers',
      sideBName: 'Warriors',
    },
    deadline: new Date(Date.now() + 900000).toISOString(), // 15 minutes from now
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [
      { 
        id: '3', 
        betId: 'live2', 
        userId: 'user3', 
        side: 'A', 
        amount: 30, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
      { 
        id: '4', 
        betId: 'live2', 
        userId: 'user4', 
        side: 'B', 
        amount: 45, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
    ],
  },
];

export const LiveEventsScreen: React.FC = () => {
  const [liveBets] = useState<Bet[]>(mockLiveBets);

  const handleBetPress = (bet: Bet) => {
    console.log('Live bet pressed:', bet.title);
    // Navigate to live bet details
  };

  const handleQuickBet = (bet: Bet, side: string) => {
    console.log('Quick bet:', bet.title, 'side:', side);
    // Handle quick bet placement
  };

  const handleLocationSearch = () => {
    console.log('Location search pressed');
    // Navigate to location search
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title="Live Events"
        showBalance={true}
        balance={1245.75}
        variant="default"
        rightComponent={
          <Text style={styles.locationText}>📍 Crypto.com Arena</Text>
        }
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Live Event Header */}
        <View style={styles.eventHeader}>
          <Text style={styles.eventTitle}>Lakers vs Warriors</Text>
          <Text style={styles.eventSubtitle}>Q3 • 8:42 remaining</Text>
          <Text style={styles.eventScore}>LAL 89 - 92 GSW</Text>
        </View>

        {/* Live Bets Section */}
        <View style={styles.liveBetsSection}>
          <Text style={styles.sectionTitle}>LIVE PROP BETS</Text>
          <Text style={styles.sectionSubtitle}>
            {liveBets.length} active • Bet in real-time
          </Text>
          
          {liveBets.map((bet) => (
            <LiveBetCard
              key={bet.id}
              bet={bet}
              onPress={handleBetPress}
              onQuickBet={handleQuickBet}
              showQuickBet={true}
            />
          ))}
        </View>

        {/* Upcoming Events */}
        <View style={styles.upcomingSection}>
          <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
          <View style={styles.upcomingEvent}>
            <Text style={styles.upcomingTitle}>Clippers vs Suns</Text>
            <Text style={styles.upcomingTime}>Tomorrow 7:30 PM</Text>
            <Text style={styles.upcomingLocation}>📍 Footprint Center</Text>
          </View>
          
          <View style={styles.upcomingEvent}>
            <Text style={styles.upcomingTitle}>Dodgers vs Giants</Text>
            <Text style={styles.upcomingTime}>Friday 7:10 PM</Text>
            <Text style={styles.upcomingLocation}>📍 Dodger Stadium</Text>
          </View>
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
  locationText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  
  // Event header
  eventHeader: {
    backgroundColor: colors.surface,
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventTitle: {
    ...textStyles.h2,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  eventSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  eventScore: {
    ...textStyles.h1,
    color: colors.primary,
    fontSize: 32,
  },
  
  // Sections
  liveBetsSection: {
    padding: 16,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginBottom: 16,
  },
  
  // Upcoming events
  upcomingSection: {
    padding: 16,
    backgroundColor: colors.surface,
  },
  upcomingEvent: {
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  upcomingTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  upcomingTime: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  upcomingLocation: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
});