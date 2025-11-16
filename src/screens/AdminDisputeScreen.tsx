/**
 * Admin Dispute Screen
 * Review and resolve user disputes on bet resolutions
 * ADMIN ONLY - Role validation enforced in DisputeService
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
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { DisputeService, Dispute } from '../services/disputeService';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

interface AdminDisputeScreenProps {
  onClose: () => void;
}

interface BetDetails {
  title: string;
  resolutionReason?: string;
  winningSide?: string;
}

interface UserDetails {
  displayName?: string;
  username: string;
}

export const AdminDisputeScreen: React.FC<AdminDisputeScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [betDetails, setBetDetails] = useState<Map<string, BetDetails>>(new Map());
  const [userDetails, setUserDetails] = useState<Map<string, UserDetails>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'UNDER_REVIEW'>('ALL');
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [resolution, setResolution] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // Check admin role on mount
  useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      Alert.alert(
        'Access Denied',
        'You do not have permission to access the dispute dashboard.',
        [{ text: 'OK', onPress: onClose }]
      );
      return;
    }
    loadDisputes();
  }, []);

  const loadDisputes = async () => {
    try {
      setIsLoading(true);
      console.log('[AdminDispute] Loading pending disputes...');
      const pendingDisputes = await DisputeService.getPendingDisputes();
      console.log('[AdminDispute] Loaded disputes:', pendingDisputes.length);
      setDisputes(pendingDisputes);

      // Fetch bet details for all disputes
      const uniqueBetIds = [...new Set(pendingDisputes.map(d => d.betId))];
      const betDetailsMap = new Map<string, BetDetails>();

      await Promise.all(
        uniqueBetIds.map(async (betId) => {
          try {
            const { data: betData } = await client.models.Bet.get({ id: betId });
            if (betData) {
              betDetailsMap.set(betId, {
                title: betData.title || 'Unknown Bet',
                resolutionReason: betData.resolutionReason || undefined,
                winningSide: betData.winningSide || undefined,
              });
            }
          } catch (error) {
            console.error('[AdminDispute] Error fetching bet details for', betId, error);
            betDetailsMap.set(betId, { title: 'Unknown Bet' });
          }
        })
      );
      setBetDetails(betDetailsMap);

      // Fetch user details for all unique user IDs (filers)
      const uniqueUserIds = [...new Set(pendingDisputes.map(d => d.filedBy))];
      const userDetailsMap = new Map<string, UserDetails>();

      await Promise.all(
        uniqueUserIds.map(async (userId) => {
          try {
            const { data: userData } = await client.models.User.get({ id: userId });
            if (userData) {
              userDetailsMap.set(userId, {
                displayName: userData.displayName || undefined,
                username: userData.username || 'Unknown User'
              });
            }
          } catch (error) {
            console.error('[AdminDispute] Error fetching user details for', userId, error);
            userDetailsMap.set(userId, { username: 'Unknown User' });
          }
        })
      );
      setUserDetails(userDetailsMap);

    } catch (error) {
      console.error('[AdminDispute] Error loading disputes:', error);
      Alert.alert('Error', 'Failed to load disputes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDisputes();
    setRefreshing(false);
  };

  const handleUpholdDispute = (dispute: Dispute) => {
    setSelectedDispute(dispute);
    setResolution('');
    setAdminNotes('');
    setResolveModalVisible(true);
  };

  const handleDismissDispute = (dispute: Dispute) => {
    Alert.alert(
      'Dismiss Dispute',
      'Are you sure you want to dismiss this dispute? The original bet resolution will stand.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: () => confirmResolveDispute(dispute, 'DISMISSED', 'Dispute reviewed and dismissed - original resolution stands.')
        }
      ]
    );
  };

  const confirmResolveDispute = async (
    dispute: Dispute,
    status: 'RESOLVED_FOR_FILER' | 'RESOLVED_FOR_CREATOR' | 'DISMISSED',
    resolutionText: string
  ) => {
    if (!user) return;

    setProcessingId(dispute.id);
    try {
      const success = await DisputeService.resolveDispute(
        dispute.id,
        status,
        resolutionText,
        user.userId,
        adminNotes.trim() || undefined
      );

      if (success) {
        Alert.alert(
          'Dispute Resolved',
          `The dispute has been ${status === 'DISMISSED' ? 'dismissed' : 'upheld'}.`,
          [{ text: 'OK' }]
        );

        // Reload disputes
        await loadDisputes();
        setResolveModalVisible(false);
        setSelectedDispute(null);
        setResolution('');
        setAdminNotes('');
      } else {
        throw new Error('Failed to resolve dispute');
      }
    } catch (error: any) {
      console.error('[AdminDispute] Error resolving dispute:', error);
      Alert.alert('Error', error.message || 'Failed to resolve dispute. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const getReasonLabel = (reason: string): string => {
    const labels: Record<string, string> = {
      'INCORRECT_RESOLUTION': 'Incorrect Winner',
      'NO_RESOLUTION': 'No Resolution',
      'EVIDENCE_IGNORED': 'Evidence Ignored',
      'OTHER': 'Other Reason'
    };
    return labels[reason] || reason;
  };

  const filteredDisputes = disputes.filter(dispute => {
    if (filter === 'ALL') return true;
    return dispute.status === filter;
  });

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Dispute Dashboard" onClose={onClose} />

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          {[
            { id: 'ALL', label: 'All' },
            { id: 'PENDING', label: 'Pending' },
            { id: 'UNDER_REVIEW', label: 'Reviewing' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.filterTab,
                filter === tab.id && styles.filterTabActive
              ]}
              onPress={() => setFilter(tab.id as typeof filter)}
            >
              <Text style={[
                styles.filterTabText,
                filter === tab.id && styles.filterTabTextActive
              ]}>
                {tab.label}
              </Text>
              <View style={[
                styles.filterBadge,
                filter === tab.id && styles.filterBadgeActive
              ]}>
                <Text style={[
                  styles.filterBadgeText,
                  filter === tab.id && styles.filterBadgeTextActive
                ]}>
                  {disputes.filter(d => tab.id === 'ALL' || d.status === tab.id).length}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dispute List */}
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading disputes...</Text>
            </View>
          ) : filteredDisputes.length > 0 ? (
            filteredDisputes.map((dispute) => {
              const bet = betDetails.get(dispute.betId);
              const filer = userDetails.get(dispute.filedBy);
              const isProcessing = processingId === dispute.id;

              return (
                <View key={dispute.id} style={styles.disputeCard}>
                  {/* Header */}
                  <View style={styles.disputeHeader}>
                    <View style={styles.disputeHeaderLeft}>
                      <Ionicons name="alert-circle" size={20} color={colors.error} />
                      <Text style={styles.disputeTitle} numberOfLines={1}>
                        {bet?.title || 'Unknown Bet'}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, styles[`status${dispute.status}`]]}>
                      <Text style={styles.statusBadgeText}>{dispute.status}</Text>
                    </View>
                  </View>

                  {/* Dispute Details */}
                  <View style={styles.disputeDetails}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Filed by:</Text>
                      <Text style={styles.detailValue}>
                        {filer?.displayName || filer?.username || 'Unknown'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Reason:</Text>
                      <Text style={styles.detailValue}>{getReasonLabel(dispute.reason)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Description:</Text>
                      <Text style={styles.detailValueMultiline} numberOfLines={3}>
                        {dispute.description}
                      </Text>
                    </View>
                    {bet?.resolutionReason && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Current Resolution:</Text>
                        <Text style={styles.detailValueMultiline} numberOfLines={2}>
                          {bet.resolutionReason}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons */}
                  {dispute.status === 'PENDING' && (
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.upholdButton]}
                        onPress={() => handleUpholdDispute(dispute)}
                        disabled={isProcessing}
                        activeOpacity={0.7}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color={colors.background} />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={18} color={colors.background} />
                            <Text style={styles.upholdButtonText}>Uphold Dispute</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.dismissButton]}
                        onPress={() => handleDismissDispute(dispute)}
                        disabled={isProcessing}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.error} />
                        <Text style={styles.dismissButtonText}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No {filter !== 'ALL' ? filter.toLowerCase() : ''} Disputes</Text>
              <Text style={styles.emptyDescription}>
                {filter === 'ALL'
                  ? 'All disputes have been resolved. Great work!'
                  : `No disputes with status: ${filter}`
                }
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Uphold Dispute Modal */}
        {resolveModalVisible && selectedDispute && (
          <Modal
            visible={resolveModalVisible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setResolveModalVisible(false)}
          >
            <SafeAreaView style={styles.modalContainer} edges={['top']}>
              <ModalHeader
                title="Uphold Dispute"
                onClose={() => setResolveModalVisible(false)}
              />
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalContent}
              >
                <ScrollView style={styles.modalScrollView}>
                  <Text style={styles.modalTitle}>Provide Resolution Details</Text>
                  <Text style={styles.modalSubtitle}>
                    Explain why you're upholding this dispute and what the correct resolution should be.
                  </Text>

                  <Text style={styles.inputLabel}>Resolution Explanation *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="The dispute is valid because..."
                    placeholderTextColor={colors.textMuted}
                    value={resolution}
                    onChangeText={setResolution}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />

                  <Text style={styles.inputLabel}>Admin Notes (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Internal notes..."
                    placeholderTextColor={colors.textMuted}
                    value={adminNotes}
                    onChangeText={setAdminNotes}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />

                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      !resolution.trim() && styles.confirmButtonDisabled
                    ]}
                    onPress={() => {
                      if (selectedDispute) {
                        confirmResolveDispute(selectedDispute, 'RESOLVED_FOR_FILER', resolution.trim());
                      }
                    }}
                    disabled={!resolution.trim() || processingId === selectedDispute?.id}
                  >
                    {processingId === selectedDispute?.id ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <Text style={styles.confirmButtonText}>Confirm Uphold</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </Modal>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },

  // Filter Tabs
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: spacing.radius.md,
    marginHorizontal: spacing.xs / 2,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    ...textStyles.button,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginRight: spacing.xs / 2,
  },
  filterTabTextActive: {
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  filterBadge: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  filterBadgeActive: {
    backgroundColor: colors.background,
  },
  filterBadgeText: {
    ...textStyles.caption,
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
  filterBadgeTextActive: {
    color: colors.primary,
  },

  // Loading & Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Dispute Card
  disputeCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: spacing.radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disputeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  disputeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  disputeTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
  },
  statusPENDING: {
    backgroundColor: colors.warning + '20',
  },
  statusUNDER_REVIEW: {
    backgroundColor: colors.primary + '20',
  },
  statusBadgeText: {
    ...textStyles.caption,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },

  // Dispute Details
  disputeDetails: {
    marginBottom: spacing.sm,
  },
  detailRow: {
    marginBottom: spacing.sm,
  },
  detailLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.xs / 2,
  },
  detailValue: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
  },
  detailValueMultiline: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 18,
  },

  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.radius.md,
    marginHorizontal: spacing.xs / 2,
  },
  upholdButton: {
    backgroundColor: colors.success,
  },
  upholdButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.bold,
  },
  dismissButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  dismissButtonText: {
    ...textStyles.button,
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.bold,
  },

  // Uphold Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    flex: 1,
  },
  modalScrollView: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  modalTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    ...textStyles.body,
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    ...textStyles.body,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 80,
  },
  confirmButton: {
    backgroundColor: colors.success,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
});
