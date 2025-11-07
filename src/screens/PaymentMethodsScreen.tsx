/**
 * Payment Methods Screen
 * Manage deposits, withdrawals, and payment methods with Venmo integration
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { AddFundsModal } from '../components/ui/AddFundsModal';
import { WithdrawFundsModal } from '../components/ui/WithdrawFundsModal';
import { AddPaymentMethodModal } from '../components/ui/AddPaymentMethodModal';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatting';
import { TransactionService } from '../services/transactionService';
import { PaymentMethodService } from '../services/paymentMethodService';
import type { PaymentMethod } from '../services/paymentMethodService';

interface PaymentMethodsScreenProps {
  onClose: () => void;
}

export const PaymentMethodsScreen: React.FC<PaymentMethodsScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal states
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAddMethodModal, setShowAddMethodModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [user?.userId]);

  const loadData = async () => {
    if (!user?.userId) return;

    try {
      setIsLoading(true);

      // Load balance and payment methods in parallel
      const [userBalance, methods] = await Promise.all([
        TransactionService.getUserBalance(user.userId),
        PaymentMethodService.getUserPaymentMethods(user.userId),
      ]);

      setBalance(userBalance);
      setPaymentMethods(methods);
    } catch (error) {
      console.error('Error loading payment data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleRemovePaymentMethod = async (paymentMethod: PaymentMethod) => {
    Alert.alert(
      'Remove Payment Method',
      `Are you sure you want to remove ${paymentMethod.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await PaymentMethodService.removePaymentMethod(paymentMethod.id);
            if (success) {
              await refreshData();
            } else {
              Alert.alert('Error', 'Failed to remove payment method');
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (paymentMethod: PaymentMethod) => {
    if (!user?.userId) return;

    const success = await PaymentMethodService.setDefaultPaymentMethod(user.userId, paymentMethod.id);
    if (success) {
      await refreshData();
    } else {
      Alert.alert('Error', 'Failed to set default payment method');
    }
  };

  const renderPaymentMethod = (method: PaymentMethod) => (
    <View key={method.id} style={styles.paymentMethodCard}>
      <View style={styles.paymentMethodLeft}>
        <View style={styles.paymentMethodIcon}>
          <Ionicons name="logo-venmo" size={24} color={colors.primary} />
        </View>
        <View style={styles.paymentMethodInfo}>
          <View style={styles.paymentMethodHeader}>
            <Text style={styles.paymentMethodName}>{method.displayName}</Text>
            {method.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Default</Text>
              </View>
            )}
          </View>
          <Text style={styles.paymentMethodUsername}>{method.venmoUsername}</Text>
          {method.isVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : (
            <View style={styles.unverifiedBadge}>
              <Ionicons name="alert-circle" size={12} color={colors.warning} />
              <Text style={styles.unverifiedText}>Pending Verification</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.paymentMethodActions}>
        {!method.isDefault && (
          <TouchableOpacity
            style={styles.actionIconButton}
            onPress={() => handleSetDefault(method)}
            activeOpacity={0.7}
          >
            <Ionicons name="star-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionIconButton}
          onPress={() => handleRemovePaymentMethod(method)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Payment Methods" onClose={onClose} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Payment Methods" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance Overview */}
        <View style={styles.balanceSection}>
          <Text style={styles.sectionTitle}>CURRENT BALANCE</Text>
          <View style={styles.balanceCard}>
            <Ionicons name="wallet-outline" size={32} color={colors.primary} />
            <Text style={styles.balanceAmount}>{formatCurrency(balance)}</Text>
            <Text style={styles.balanceLabel}>Available to bet</Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={refreshData}
              disabled={isRefreshing}
              activeOpacity={0.7}
            >
              <Ionicons
                name="refresh"
                size={16}
                color={colors.textSecondary}
                style={isRefreshing ? styles.refreshing : undefined}
              />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowAddFundsModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.actionButtonLeft}>
              <View style={[styles.actionIcon, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="add-circle" size={24} color={colors.success} />
              </View>
              <Text style={styles.actionButtonText}>Add Funds</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowWithdrawModal(true)}
            activeOpacity={0.7}
          >
            <View style={styles.actionButtonLeft}>
              <View style={[styles.actionIcon, { backgroundColor: colors.warning + '20' }]}>
                <Ionicons name="arrow-up-circle" size={24} color={colors.warning} />
              </View>
              <Text style={styles.actionButtonText}>Withdraw Funds</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Payment Methods */}
        <View style={styles.methodsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>SAVED PAYMENT METHODS</Text>
            <TouchableOpacity
              style={styles.addMethodButton}
              onPress={() => setShowAddMethodModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.addMethodButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {paymentMethods.length > 0 ? (
            <View style={styles.paymentMethodsList}>
              {paymentMethods.map(renderPaymentMethod)}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyStateTitle}>No Payment Methods</Text>
              <Text style={styles.emptyStateText}>
                Add a Venmo account to deposit or withdraw funds
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddMethodModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={20} color={colors.background} />
                <Text style={styles.addButtonText}>Add Payment Method</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={24} color={colors.info} />
          <View style={styles.infoBannerContent}>
            <Text style={styles.infoBannerTitle}>How It Works</Text>
            <Text style={styles.infoBannerText}>
              Add funds via Venmo to get started. Your payment method will be automatically verified when your first deposit is approved (typically 1-2 hours). Once verified, you can withdraw funds anytime. Withdrawals are processed within 1-2 business days.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      <AddFundsModal
        visible={showAddFundsModal}
        onClose={() => setShowAddFundsModal(false)}
        onSuccess={refreshData}
        onAddPaymentMethod={() => setShowAddMethodModal(true)}
      />
      <WithdrawFundsModal
        visible={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSuccess={refreshData}
        onAddPaymentMethod={() => setShowAddMethodModal(true)}
      />
      <AddPaymentMethodModal
        visible={showAddMethodModal}
        onClose={() => setShowAddMethodModal(false)}
        onSuccess={refreshData}
      />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Section
  balanceSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionsSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  methodsSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
  },

  // Balance Card
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  balanceAmount: {
    ...textStyles.h1,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.sm,
  },
  balanceLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  refreshButtonText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs / 2,
  },
  refreshing: {
    transform: [{ rotate: '360deg' }],
  },

  // Action Buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: spacing.radius.md,
    marginBottom: spacing.sm,
  },
  actionButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  actionButtonText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },

  // Add Method Button
  addMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  addMethodButtonText: {
    ...textStyles.button,
    color: colors.primary,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },

  // Payment Methods List
  paymentMethodsList: {
    marginTop: spacing.xs,
  },
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentMethodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  paymentMethodName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.xs,
  },
  defaultBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
  },
  defaultBadgeText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  paymentMethodUsername: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedText: {
    ...textStyles.caption,
    color: colors.success,
    marginLeft: spacing.xs / 2,
    fontSize: 12,
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unverifiedText: {
    ...textStyles.caption,
    color: colors.warning,
    marginLeft: spacing.xs / 2,
    fontSize: 12,
  },
  paymentMethodActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptyStateText: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    marginTop: spacing.md,
  },
  addButtonText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: colors.info + '20',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.info + '40',
  },
  infoBannerContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  infoBannerTitle: {
    ...textStyles.button,
    color: colors.info,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  infoBannerText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
