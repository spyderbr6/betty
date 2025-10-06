/**
 * Payment Methods Screen
 * Manage deposits, withdrawals, and payment methods (placeholder for future implementation)
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatting';

interface PaymentMethodsScreenProps {
  onClose: () => void;
}

export const PaymentMethodsScreen: React.FC<PaymentMethodsScreenProps> = ({ onClose }) => {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Payment Methods" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance Overview */}
        <View style={styles.balanceSection}>
          <Text style={styles.sectionTitle}>CURRENT BALANCE</Text>
          <View style={styles.balanceCard}>
            <Ionicons name="wallet-outline" size={32} color={colors.primary} />
            <Text style={styles.balanceAmount}>{formatCurrency(1000)}</Text>
            <Text style={styles.balanceLabel}>Available to bet</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
          <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
            <View style={styles.actionButtonLeft}>
              <View style={[styles.actionIcon, { backgroundColor: colors.success + '20' }]}>
                <Ionicons name="add-circle" size={24} color={colors.success} />
              </View>
              <Text style={styles.actionButtonText}>Add Funds</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} activeOpacity={0.7}>
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
          <Text style={styles.sectionTitle}>SAVED PAYMENT METHODS</Text>

          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyStateTitle}>No Payment Methods</Text>
            <Text style={styles.emptyStateText}>
              Add a payment method to deposit or withdraw funds
            </Text>
            <TouchableOpacity style={styles.addButton} activeOpacity={0.8}>
              <Ionicons name="add" size={20} color={colors.background} />
              <Text style={styles.addButtonText}>Add Payment Method</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transaction History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>RECENT TRANSACTIONS</Text>

          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyStateTitle}>No Transactions</Text>
            <Text style={styles.emptyStateText}>
              Your transaction history will appear here
            </Text>
          </View>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={24} color={colors.info} />
          <View style={styles.infoBannerContent}>
            <Text style={styles.infoBannerTitle}>Coming Soon</Text>
            <Text style={styles.infoBannerText}>
              Payment integration is currently in development. In the meantime, use your demo balance to place bets.
            </Text>
          </View>
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
  historySection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
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
