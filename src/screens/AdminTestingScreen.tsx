/**
 * Admin Testing Screen
 *
 * Admin-only screen for testing and debugging various system features
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModalHeader } from '../components/ui/ModalHeader';
import { colors, typography, spacing, textStyles } from '../styles';
import { useAuth } from '../contexts/AuthContext';
import {
  triggerEventFetch,
  checkEventsInDatabase,
  testSportsAPI,
  runFullDiagnostics
} from '../utils/testEventFetcher';
import { NotificationService } from '../services/notificationService';
import { TransactionService } from '../services/transactionService';
import { formatCurrency } from '../utils/formatting';
import { showAlert } from '../components/ui/CustomAlert';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

interface TestModule {
  id: string;
  title: string;
  description: string;
  action: () => Promise<void>;
}

export const AdminTestingScreen: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Check if user is admin
  React.useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      showAlert(
        'Access Denied',
        'You do not have permission to access admin testing tools.',
        [{ text: 'OK', onPress: onClose }]
      );
    }
  }, [user]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    console.log(message);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const runTest = async (testId: string, testFn: () => Promise<void>) => {
    setActiveTest(testId);
    setLoading(true);
    clearLogs();

    try {
      addLog(`Starting test: ${testId}`);
      await testFn();
      addLog(`✅ Test completed: ${testId}`);
      showAlert('Success', `Test "${testId}" completed successfully. Check logs for details.`);
    } catch (error) {
      addLog(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
      showAlert('Error', `Test "${testId}" failed. Check logs for details.`);
    } finally {
      setLoading(false);
      setActiveTest(null);
    }
  };

  const eventTestModules: TestModule[] = [
    {
      id: 'test-api',
      title: 'Test TheSportsDB API',
      description: 'Tests direct API connection to TheSportsDB to verify it returns data',
      action: async () => {
        addLog('Testing TheSportsDB API...');
        await testSportsAPI();
      }
    },
    {
      id: 'check-db',
      title: 'Check Events in Database',
      description: 'Queries the LiveEvent table to see how many events exist',
      action: async () => {
        addLog('Checking database for events...');
        const count = await checkEventsInDatabase();
        addLog(`Found ${count} events in database`);
      }
    },
    {
      id: 'trigger-fetch',
      title: 'Trigger Event Fetcher Lambda',
      description: 'Manually triggers the event fetcher Lambda function',
      action: async () => {
        addLog('Triggering event fetcher Lambda...');
        await triggerEventFetch();
        addLog('Event fetcher triggered successfully');
      }
    },
    {
      id: 'full-diagnostics',
      title: 'Run Full Diagnostics',
      description: 'Runs complete diagnostic suite: API test, DB check, trigger fetch, verify results',
      action: async () => {
        addLog('Running full diagnostic suite...');
        await runFullDiagnostics();
      }
    },
  ];

  const pushNotificationTestModules: TestModule[] = [
    {
      id: 'check-push-token',
      title: 'Check Push Token Status',
      description: 'Verifies your push token is registered and active',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Checking push token status...');
        const { data: tokens } = await client.models.PushToken.list({
          filter: {
            userId: { eq: user.userId },
            isActive: { eq: true }
          }
        });

        if (!tokens || tokens.length === 0) {
          addLog('❌ No active push tokens found');
          addLog('💡 Try logging out and back in to register a token');
        } else {
          addLog(`✅ Found ${tokens.length} active push token(s)`);
          tokens.forEach((token, idx) => {
            addLog(`Token ${idx + 1}:`);
            addLog(`  Platform: ${token.platform}`);
            addLog(`  Token: ${token.token?.substring(0, 30)}...`);
            addLog(`  Last used: ${token.lastUsed || 'Never'}`);
          });
        }
      }
    },
    {
      id: 'send-test-push-high',
      title: 'Send Test Push (HIGH Priority)',
      description: 'Sends a high-priority push notification to yourself',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Sending HIGH priority test push notification...');
        const notification = await NotificationService.createNotification({
          userId: user.userId,
          type: 'SYSTEM_ANNOUNCEMENT',
          title: '🔔 Test Push Notification',
          message: 'This is a HIGH priority test notification. If you see this, push notifications are working!',
          priority: 'HIGH',
          sendPush: true,
          actionType: 'view_notifications',
        });

        if (notification) {
          addLog('✅ Test notification sent successfully');
          addLog(`Notification ID: ${notification.id}`);
          addLog('📱 Check your device for the push notification');
          addLog('💡 Tap it to test deep linking');
        } else {
          addLog('❌ Failed to create notification');
        }
      }
    },
    {
      id: 'send-test-push-urgent',
      title: 'Send Test Push (URGENT Priority)',
      description: 'Sends an urgent priority push notification to yourself',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Sending URGENT priority test push notification...');
        const notification = await NotificationService.createNotification({
          userId: user.userId,
          type: 'BET_RESOLVED',
          title: '🎉 You Won!',
          message: 'Test bet resolved - You won $100! (This is just a test)',
          priority: 'URGENT',
          sendPush: true,
          actionType: 'view_bet',
          actionData: { betId: 'test-bet-123' },
        });

        if (notification) {
          addLog('✅ URGENT test notification sent successfully');
          addLog(`Notification ID: ${notification.id}`);
          addLog('📱 Check your device for the push notification');
          addLog('💡 Tap it to test navigation to Resolve screen');
        } else {
          addLog('❌ Failed to create notification');
        }
      }
    },
    {
      id: 'test-bet-invitation-push',
      title: 'Send Bet Invitation Push',
      description: 'Simulates receiving a bet invitation notification',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Sending bet invitation test push...');
        const notification = await NotificationService.createNotification({
          userId: user.userId,
          type: 'BET_INVITATION_RECEIVED',
          title: '🎲 Bet Invitation',
          message: 'Test User invited you to bet on "Lakers vs Celtics"',
          priority: 'HIGH',
          sendPush: true,
          actionType: 'view_bet_invitation',
          actionData: { betId: 'test-bet-456', invitationId: 'test-inv-789' },
          relatedBetId: 'test-bet-456',
        });

        if (notification) {
          addLog('✅ Bet invitation push sent successfully');
          addLog('📱 Tap the notification to test navigation');
        } else {
          addLog('❌ Failed to create notification');
        }
      }
    },
    {
      id: 'test-friend-request-push',
      title: 'Send Friend Request Push',
      description: 'Simulates receiving a friend request notification',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Sending friend request test push...');
        const notification = await NotificationService.createNotification({
          userId: user.userId,
          type: 'FRIEND_REQUEST_RECEIVED',
          title: '👋 New Friend Request',
          message: 'Test User sent you a friend request',
          priority: 'MEDIUM',
          sendPush: true,
          actionType: 'view_friend_requests',
          relatedUserId: 'test-user-123',
        });

        if (notification) {
          addLog('✅ Friend request push sent successfully');
          addLog('📱 Tap the notification to test navigation to Account screen');
        } else {
          addLog('❌ Failed to create notification');
        }
      }
    },
    {
      id: 'view-recent-notifications',
      title: 'View Recent Notifications',
      description: 'Shows your last 10 notifications from the database',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Fetching recent notifications...');
        const notifications = await NotificationService.getUserNotifications(user.userId, {
          limit: 10
        });

        if (notifications.length === 0) {
          addLog('No notifications found');
        } else {
          addLog(`Found ${notifications.length} recent notifications:`);
          notifications.forEach((notif, idx) => {
            addLog(`${idx + 1}. [${notif.priority}] ${notif.title}`);
            addLog(`   Type: ${notif.type}`);
            addLog(`   Read: ${notif.isRead ? 'Yes' : 'No'}`);
            addLog(`   Created: ${new Date(notif.createdAt).toLocaleString()}`);
          });
        }
      }
    },
    {
      id: 'test-all-push-types',
      title: 'Send All Notification Types',
      description: 'Sends one of each notification type for comprehensive testing',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Sending all notification types...');

        const notificationTypes = [
          {
            type: 'BET_RESOLVED' as const,
            title: '🎉 You Won!',
            message: 'Test: You won $50 on Lakers bet',
            priority: 'HIGH' as const,
          },
          {
            type: 'BET_INVITATION_RECEIVED' as const,
            title: '🎲 Bet Invitation',
            message: 'Test: Friend invited you to a bet',
            priority: 'HIGH' as const,
          },
          {
            type: 'FRIEND_REQUEST_RECEIVED' as const,
            title: '👋 Friend Request',
            message: 'Test: New friend request',
            priority: 'MEDIUM' as const,
          },
          {
            type: 'DEPOSIT_COMPLETED' as const,
            title: '💰 Deposit Complete',
            message: 'Test: $100 deposit successful',
            priority: 'HIGH' as const,
          },
          {
            type: 'BET_DEADLINE_APPROACHING' as const,
            title: '⏰ Bet Closing Soon',
            message: 'Test: Bet closes in 1 hour',
            priority: 'MEDIUM' as const,
          },
        ];

        for (const notif of notificationTypes) {
          await NotificationService.createNotification({
            userId: user.userId,
            type: notif.type,
            title: notif.title,
            message: notif.message,
            priority: notif.priority,
            sendPush: true,
          });
          addLog(`✅ Sent: ${notif.title}`);
          // Small delay between notifications
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        addLog('✅ All notification types sent!');
        addLog('📱 Check your device for 5 push notifications');
      }
    },
  ];

  const betTestingModules: TestModule[] = [
    {
      id: 'create-test-bet',
      title: 'Create Joinable Test Bet',
      description: 'Creates a public bet by "Test User" - you can join it as a normal user',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Creating joinable test bet...');

        // Find or create a test user to be the creator
        const testUsername = 'test-bet-creator';
        let testUserId = 'test-user-' + Date.now();

        addLog('Looking for test user account...');
        const { data: existingUsers } = await client.models.User.list({
          filter: { username: { eq: testUsername } }
        });

        if (existingUsers && existingUsers.length > 0) {
          testUserId = existingUsers[0].id;
          addLog(`✅ Using existing test user: ${testUserId}`);
        } else {
          addLog('Creating test user account...');
          const { data: newTestUser } = await client.models.User.create({
            id: testUserId,
            username: testUsername,
            email: 'testuser@sidebet.test',
            displayName: 'Test User',
            balance: 1000,
            trustScore: 5.0,
            totalBets: 0,
            totalWinnings: 0,
            winRate: 0,
            role: 'USER',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          if (newTestUser) {
            addLog(`✅ Created test user: ${testUserId}`);
          }
        }

        const deadline = new Date();
        deadline.setMinutes(deadline.getMinutes() + 60);

        // Create bet with test user as creator (NOT current admin user)
        const { data: newBet } = await client.models.Bet.create({
          title: 'TEST: Will it rain tomorrow?',
          description: 'Public test bet - anyone can join!',
          category: 'CUSTOM',
          status: 'ACTIVE',
          creatorId: testUserId, // Test user is creator, not you
          totalPot: 0, // No one joined yet
          betAmount: 10,
          odds: JSON.stringify({
            sideAName: 'Yes',
            sideBName: 'No'
          }),
          deadline: deadline.toISOString(),
          isPrivate: false,
          isTestBet: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        if (!newBet) {
          addLog('❌ Failed to create bet');
          return;
        }

        addLog(`✅ Test bet created! ID: ${newBet.id}`);
        addLog(`📍 Creator: "Test User" (not you)`);
        addLog('📍 You can JOIN this bet from Home screen');
        addLog('👥 It will show in Active/Live bets');
        addLog('💡 Test the join flow as a regular user');
      }
    },
    {
      id: 'list-my-test-bets',
      title: 'List My Active Bets',
      description: 'Shows all your active bets (for resolving)',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('Loading your active bets...');
        const { data: betsData } = await client.models.Bet.list({
          filter: {
            and: [
              { creatorId: { eq: user.userId } },
              { status: { eq: 'ACTIVE' } }
            ]
          }
        });

        if (!betsData || betsData.length === 0) {
          addLog('No active bets found');
          return;
        }

        addLog(`Found ${betsData.length} active bet(s):`);
        betsData.forEach((bet, idx) => {
          addLog(`${idx + 1}. ${bet.title}`);
          addLog(`   ID: ${bet.id}`);
          addLog(`   Pot: ${formatCurrency(bet.totalPot || 0)}`);
          addLog(`   Deadline: ${new Date(bet.deadline).toLocaleString()}`);
        });
      }
    },
    {
      id: 'resolve-test-bet',
      title: 'Resolve Test Bet (Manual)',
      description: 'Resolves a specific bet by ID - requires betId and winningSide',
      action: async () => {
        if (!user) {
          addLog('❌ No user logged in');
          return;
        }

        addLog('⚠️ This requires manual bet ID and side input');
        addLog('Use "List My Active Bets" to find bet IDs first');
        addLog('Then call resolveBet() from logs with:');
        addLog('  betId: "your-bet-id"');
        addLog('  winningSide: "A" or "B"');
      }
    },
  ];

  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader
        title="Admin Testing Tools"
        onClose={onClose}
        rightComponent={
          logs.length > 0 ? (
            <TouchableOpacity onPress={clearLogs} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView style={styles.content}>
        {/* Admin Badge */}
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>🔧 ADMIN MODE</Text>
        </View>

        {/* Push Notification Tests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📱 Push Notification Tests</Text>
          <Text style={styles.sectionDescription}>
            Test push notifications on your device. Make sure you're using an EAS development build on a physical device.
          </Text>
          {pushNotificationTestModules.map((module) => (
            <TouchableOpacity
              key={module.id}
              style={[
                styles.testCard,
                activeTest === module.id && styles.testCardActive
              ]}
              onPress={() => runTest(module.id, module.action)}
              disabled={loading}
            >
              <View style={styles.testCardHeader}>
                <Text style={styles.testCardTitle}>{module.title}</Text>
                {activeTest === module.id && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>
              <Text style={styles.testCardDescription}>{module.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Event System Tests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏀 Event System Tests</Text>
          {eventTestModules.map((module) => (
            <TouchableOpacity
              key={module.id}
              style={[
                styles.testCard,
                activeTest === module.id && styles.testCardActive
              ]}
              onPress={() => runTest(module.id, module.action)}
              disabled={loading}
            >
              <View style={styles.testCardHeader}>
                <Text style={styles.testCardTitle}>{module.title}</Text>
                {activeTest === module.id && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>
              <Text style={styles.testCardDescription}>{module.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bet System Tests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎲 Bet System Tests</Text>
          <Text style={styles.sectionDescription}>
            Create and manage test bets. Test bets are public and visible to all users.
          </Text>
          {betTestingModules.map((module) => (
            <TouchableOpacity
              key={module.id}
              style={[
                styles.testCard,
                activeTest === module.id && styles.testCardActive
              ]}
              onPress={() => runTest(module.id, module.action)}
              disabled={loading}
            >
              <View style={styles.testCardHeader}>
                <Text style={styles.testCardTitle}>{module.title}</Text>
                {activeTest === module.id && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>
              <Text style={styles.testCardDescription}>{module.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logs Section */}
        {logs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Logs</Text>
            <View style={styles.logsContainer}>
              {logs.map((log, index) => (
                <Text key={index} style={styles.logText}>
                  {log}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            💡 These tools are for testing and debugging only.
          </Text>
          <Text style={[styles.infoText, { marginTop: spacing.sm }]}>
            📱 Push notifications require an EAS development build on a physical device. They won't work in Expo Go or emulators.
          </Text>
          <Text style={[styles.infoText, { marginTop: spacing.sm }]}>
            📖 See PUSH_NOTIFICATION_GUIDE.md for detailed setup instructions.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  clearButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  clearButtonText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  adminBadge: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
  },
  adminBadgeText: {
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  section: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  testCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  testCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLight,
  },
  testCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  testCardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  testCardDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  logsContainer: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logText: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  infoSection: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: spacing.radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
