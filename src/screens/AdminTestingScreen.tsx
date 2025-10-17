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
      Alert.alert(
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
      Alert.alert('Success', `Test "${testId}" completed successfully. Check logs for details.`);
    } catch (error) {
      addLog(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
      Alert.alert('Error', `Test "${testId}" failed. Check logs for details.`);
    } finally {
      setLoading(false);
      setActiveTest(null);
    }
  };

  const testModules: TestModule[] = [
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

        {/* Test Modules */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event System Tests</Text>
          {testModules.map((module) => (
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
            💡 These tools are for testing and debugging only. Use them to verify the event system is working correctly.
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
    marginBottom: spacing.sm,
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
