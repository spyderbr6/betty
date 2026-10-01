/**
 * Notification settings: this device, alert switches, per-category alerts and feed
 * visibility, quiet hours, and the user's devices.
 *
 * Preferences are per account; push is also switchable per device. Every category's
 * alerts can be muted; feed-locked categories (money, results, refunds, disputes) always
 * show in the feed. See docs/NOTIFICATIONS_PLAN.md §3.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { colors, spacing, textStyles } from '../../styles';
import { showAlert } from '../ui/CustomAlert';
import { NotificationService, DevicePushPermission } from '../../services/notificationService';
import {
  NotificationPreferencesService,
  UserNotificationPreferences,
} from '../../services/notificationPreferencesService';
import { getInstallationId } from '../../services/installationId';
import { describeLastSeen, formatMinuteOfDay, stepMinuteOfDay } from '../../services/notificationSettingsFormat';
import {
  CATEGORY_INFO,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from '../../../amplify/shared/notificationCatalog';
import { setMuted, type ResolvedPreferences } from '../../../amplify/shared/notificationPreferencesLogic';

const client = generateClient<Schema>();

/** Default quiet hours offered when the user first turns them on: 10 PM to 7 AM. */
const DEFAULT_QUIET_START = 22 * 60;
const DEFAULT_QUIET_END = 7 * 60;
const QUIET_STEP_MINUTES = 30;

interface DeviceRow {
  id: string;
  installationId: string;
  platform?: 'IOS' | 'ANDROID' | 'WEB' | null;
  deviceName?: string | null;
  pushEnabled?: boolean | null;
  isActive?: boolean | null;
  lastSeenAt?: string | null;
}

const CATEGORY_ICONS: Record<NotificationCategory, keyof typeof Ionicons.glyphMap> = {
  FRIENDS: 'people-outline',
  INVITATIONS: 'mail-open-outline',
  MY_BET_ACTIVITY: 'person-add-outline',
  RESULTS: 'trophy-outline',
  ACTION_NEEDED: 'alert-circle-outline',
  REFUNDS: 'return-down-back-outline',
  REMINDERS: 'time-outline',
  SQUARES_UPDATES: 'grid-outline',
  MONEY: 'wallet-outline',
  ANNOUNCEMENTS: 'megaphone-outline',
};

const PLATFORM_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  WEB: 'globe-outline',
  ANDROID: 'logo-android',
  IOS: 'logo-apple',
};

const blockedInstructions = () =>
  Platform.OS === 'web'
    ? 'Notifications are blocked for this site. Allow them in your browser\'s site settings, then come back here.'
    : 'Notifications are turned off for SideBet. Turn them on in your device Settings > Notifications > SideBet.';

const deviceStatusText = (permission: DevicePushPermission): string => {
  switch (permission) {
    case 'granted':
      return 'Push notifications are allowed on this device';
    case 'denied':
      return blockedInstructions();
    case 'unsupported':
      return Platform.OS === 'web'
        ? 'This browser does not support push notifications'
        : 'Push notifications are not available on this device';
    default:
      return 'Allow notifications to get alerts on this device';
  }
};

export const NotificationPreferencesPanel: React.FC<{ userId: string }> = ({ userId }) => {
  const [prefs, setPrefs] = useState<UserNotificationPreferences | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [installationId, setInstallationId] = useState<string | null>(null);
  const [devicePermission, setDevicePermission] = useState<DevicePushPermission>('undetermined');
  const [isEnablingDevice, setIsEnablingDevice] = useState(false);

  // Saves are chained so quick successive toggles land in order, each writing the latest state.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const prefsRef = useRef<UserNotificationPreferences | null>(null);

  const loadPreferences = useCallback(async () => {
    setLoadFailed(false);
    try {
      const loaded = await NotificationPreferencesService.getUserPreferences(userId);
      prefsRef.current = loaded;
      setPrefs(loaded);
    } catch {
      setLoadFailed(true);
    }
  }, [userId]);

  const loadDevices = useCallback(async () => {
    try {
      // Cast as elsewhere: the index query trips TS2590 on the generated model types.
      const { data } = await (client.models.PushDevice as any).pushDevicesByUser({ userId }, { limit: 100 });
      const rows = ((data ?? []) as DeviceRow[]).sort((a, b) =>
        (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '')
      );
      setDevices(rows);
    } catch (error) {
      console.warn('[NotificationSettings] Could not load devices:', error);
    }
  }, [userId]);

  const refreshDevicePermission = useCallback(async () => {
    setDevicePermission(await NotificationService.getDevicePushPermission());
  }, []);

  useEffect(() => {
    loadPreferences();
    loadDevices();
    refreshDevicePermission();
    getInstallationId().then(setInstallationId);
  }, [loadPreferences, loadDevices, refreshDevicePermission]);

  /** Apply a change optimistically and save it; revert and tell the user if the save fails. */
  const update = (change: (current: ResolvedPreferences) => Partial<ResolvedPreferences>) => {
    const current = prefsRef.current;
    if (!current) return;
    const next = { ...current, ...change(current) };
    prefsRef.current = next;
    setPrefs(next);

    saveChain.current = saveChain.current.then(async () => {
      const ok = await NotificationPreferencesService.savePreferences(userId, prefsRef.current!);
      if (!ok) {
        showAlert('Error', 'Failed to update notification settings. Please try again.');
        await loadPreferences();
      }
    });
  };

  // ---- This device -------------------------------------------------------------------

  // Must run from a tap: browsers only show the permission prompt in response to a user gesture.
  const handleEnableThisDevice = async () => {
    if (isEnablingDevice) return;
    setIsEnablingDevice(true);
    try {
      const token = await NotificationService.registerPushToken(userId, { prompt: true, force: true });
      const permission = await NotificationService.getDevicePushPermission();
      setDevicePermission(permission);

      if (token) {
        // Enabling the device implies wanting push, so turn the account switch on too.
        if (prefsRef.current && !prefsRef.current.pushEnabled) {
          update(() => ({ pushEnabled: true }));
        }
        await loadDevices();
      } else if (permission === 'denied') {
        showAlert('Notifications Blocked', blockedInstructions());
      }
    } finally {
      setIsEnablingDevice(false);
    }
  };

  const handlePushMasterToggle = async (value: boolean) => {
    update(() => ({ pushEnabled: value }));
    if (value && devicePermission !== 'granted') {
      // Turning push on from a tap is also the moment to ask for this device's permission.
      await handleEnableThisDevice();
    }
  };

  // ---- Devices -----------------------------------------------------------------------

  const setDevicePush = async (device: DeviceRow, pushEnabled: boolean) => {
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, pushEnabled } : d)));
    try {
      const { errors } = await client.mutations.setDevicePush({ deviceId: device.id, pushEnabled });
      if (errors?.length) throw new Error(errors[0].message);
    } catch (error) {
      console.error('[NotificationSettings] setDevicePush failed:', error);
      setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, pushEnabled: !pushEnabled } : d)));
      showAlert('Error', 'Failed to update this device. Please try again.');
    }
  };

  const removeDevice = (device: DeviceRow) => {
    const isThis = device.installationId === installationId;
    showAlert(
      'Remove Device',
      isThis
        ? 'This device will stop receiving push notifications. It registers again the next time you sign in on it.'
        : `${device.deviceName || 'This device'} will stop receiving push notifications until you sign in on it again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // Cast as elsewhere: the generated model type trips TS2590 here.
              await (client.models.PushDevice as any).delete({ id: device.id });
              setDevices((prev) => prev.filter((d) => d.id !== device.id));
            } catch (error) {
              console.error('[NotificationSettings] Remove device failed:', error);
              showAlert('Error', 'Failed to remove the device. Please try again.');
            }
          },
        },
      ]
    );
  };

  // ---- Render ------------------------------------------------------------------------

  if (!prefs) {
    return (
      <View style={styles.loadingContainer}>
        {loadFailed ? (
          <>
            <Text style={styles.errorText}>Failed to load notification settings</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={loadPreferences}>
              <Text style={styles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>
    );
  }

  const thisDevice = devices.find((d) => d.installationId === installationId);
  const quietStart = prefs.quietStartMinute ?? DEFAULT_QUIET_START;
  const quietEnd = prefs.quietEndMinute ?? DEFAULT_QUIET_END;

  return (
    <View testID="settings-notifications">
      {/* This device */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>THIS DEVICE</Text>

        <View style={styles.row} testID="settings-device-push">
          <View style={styles.rowLeft}>
            <Ionicons
              name={devicePermission === 'granted' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={22}
              color={devicePermission === 'granted' ? colors.success : colors.textSecondary}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>This Device</Text>
              <Text style={styles.rowSubtitle} testID="settings-device-push-status">
                {deviceStatusText(devicePermission)}
              </Text>
            </View>
          </View>
          {devicePermission === 'undetermined' && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleEnableThisDevice}
              disabled={isEnablingDevice}
              testID="settings-enable-device-push"
            >
              {isEnablingDevice ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Enable</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {thisDevice && (
          <SwitchRow
            icon="phone-portrait-outline"
            title="Push on This Device"
            subtitle="Turn off to stop pushes here without affecting your other devices"
            value={thisDevice.pushEnabled !== false}
            onValueChange={(v) => setDevicePush(thisDevice, v)}
            testID="settings-this-device-push"
          />
        )}
      </View>

      {/* Master switches */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ALERTS</Text>
        <SwitchRow
          icon="notifications-outline"
          title="Push Notifications"
          subtitle="Alerts on your devices when you're not in the app"
          value={prefs.pushEnabled}
          onValueChange={handlePushMasterToggle}
          testID="settings-push-enabled"
        />
        <SwitchRow
          icon="chatbox-ellipses-outline"
          title="In-App Banners"
          subtitle="Banners at the top of the screen while you're using the app"
          value={prefs.inAppEnabled}
          onValueChange={(v) => update(() => ({ inAppEnabled: v }))}
          testID="settings-inapp-enabled"
        />
      </View>

      {/* Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WHAT TO NOTIFY ME ABOUT</Text>
        <Text style={styles.sectionNote}>
          Alerts are push notifications and banners. The feed is your notification list.
          Money, results, refunds and disputes always stay in your feed.
        </Text>

        {NOTIFICATION_CATEGORIES.map((category) => {
          const info = CATEGORY_INFO[category];
          const alertsOn = !prefs.alertMuted.includes(category);
          const feedOn = !prefs.feedMuted.includes(category);
          return (
            <View key={category} style={styles.categoryRow} testID={`settings-category-${category}`}>
              <View style={styles.rowLeft}>
                <Ionicons name={CATEGORY_ICONS[category]} size={22} color={colors.textSecondary} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{info.label}</Text>
                  <Text style={styles.rowSubtitle}>{info.description}</Text>
                </View>
              </View>
              <View style={styles.categoryControls}>
                <View style={styles.categoryControl}>
                  <Text style={styles.controlLabel}>Alerts</Text>
                  <Switch
                    value={alertsOn}
                    onValueChange={(v) =>
                      update((current) => ({ alertMuted: setMuted(current.alertMuted, category, !v) }))
                    }
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.background}
                    testID={`settings-category-${category}-alerts`}
                  />
                </View>
                <View style={styles.categoryControl}>
                  <Text style={styles.controlLabel}>Feed</Text>
                  {info.feedLocked ? (
                    <View style={styles.lockedFeed} testID={`settings-category-${category}-feed-locked`}>
                      <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
                      <Text style={styles.lockedFeedText}>Always</Text>
                    </View>
                  ) : (
                    <Switch
                      value={feedOn}
                      onValueChange={(v) =>
                        update((current) => ({ feedMuted: setMuted(current.feedMuted, category, !v) }))
                      }
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={colors.background}
                      testID={`settings-category-${category}-feed`}
                    />
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Quiet hours */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>QUIET HOURS</Text>
        <SwitchRow
          icon="moon-outline"
          title="Quiet Hours"
          subtitle="Hold push notifications overnight. Banners and your feed are unaffected."
          value={prefs.quietHoursEnabled}
          onValueChange={(v) =>
            update((current) => ({
              quietHoursEnabled: v,
              quietStartMinute: current.quietStartMinute ?? DEFAULT_QUIET_START,
              quietEndMinute: current.quietEndMinute ?? DEFAULT_QUIET_END,
            }))
          }
          testID="settings-quiet-enabled"
        />
        {prefs.quietHoursEnabled && (
          <>
            <TimeStepper
              label="Starts"
              minute={quietStart}
              onChange={(m) => update(() => ({ quietStartMinute: m }))}
              testID="settings-quiet-start"
            />
            <TimeStepper
              label="Ends"
              minute={quietEnd}
              onChange={(m) => update(() => ({ quietEndMinute: m }))}
              testID="settings-quiet-end"
            />
            <Text style={styles.sectionNote} testID="settings-quiet-timezone">
              {prefs.timezone
                ? `Times are in your timezone (${prefs.timezone}).`
                : 'Times are in your timezone, which is set the next time this device registers for push.'}
            </Text>
          </>
        )}
      </View>

      {/* Devices */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>YOUR DEVICES</Text>
        {devices.length === 0 ? (
          <Text style={styles.sectionNote} testID="settings-devices-empty">
            No devices are registered for push yet.
          </Text>
        ) : (
          devices.map((device) => {
            const isThis = device.installationId === installationId;
            return (
              <View key={device.id} style={styles.row} testID={`settings-device-${device.installationId}`}>
                <View style={styles.rowLeft}>
                  <Ionicons
                    name={PLATFORM_ICONS[device.platform ?? ''] ?? 'hardware-chip-outline'}
                    size={22}
                    color={colors.textSecondary}
                  />
                  <View style={styles.rowText}>
                    <View style={styles.deviceTitleRow}>
                      <Text style={styles.rowTitle}>{device.deviceName || 'Unknown device'}</Text>
                      {isThis && (
                        <View style={styles.thisDeviceBadge}>
                          <Text style={styles.thisDeviceBadgeText}>THIS DEVICE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowSubtitle}>
                      {device.isActive === false ? 'Signed out' : describeLastSeen(device.lastSeenAt)}
                    </Text>
                  </View>
                </View>
                {device.isActive !== false && (
                  <Switch
                    value={device.pushEnabled !== false}
                    onValueChange={(v) => setDevicePush(device, v)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.background}
                    testID={`settings-device-${device.installationId}-push`}
                  />
                )}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => removeDevice(device)}
                  accessibilityLabel={`Remove ${device.deviceName || 'device'}`}
                  testID={`settings-device-${device.installationId}-remove`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
};

interface SwitchRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

const SwitchRow: React.FC<SwitchRowProps> = ({ icon, title, subtitle, value, onValueChange, testID }) => (
  <View style={styles.row}>
    <View style={styles.rowLeft}>
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor={colors.background}
      testID={testID}
    />
  </View>
);

/** A time of day adjusted in 30-minute steps. Works the same on native and web. */
const TimeStepper: React.FC<{
  label: string;
  minute: number;
  onChange: (minute: number) => void;
  testID: string;
}> = ({ label, minute, onChange, testID }) => (
  <View style={styles.row}>
    <Text style={[styles.rowTitle, styles.stepperLabel]}>{label}</Text>
    <View style={styles.stepper}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => onChange(stepMinuteOfDay(minute, -QUIET_STEP_MINUTES))}
        accessibilityLabel={`${label} earlier`}
        testID={`${testID}-earlier`}
      >
        <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.stepperValue} testID={`${testID}-value`}>
        {formatMinuteOfDay(minute)}
      </Text>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => onChange(stepMinuteOfDay(minute, QUIET_STEP_MINUTES))}
        accessibilityLabel={`${label} later`}
        testID={`${testID}-later`}
      >
        <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    ...textStyles.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  section: {
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  rowTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  categoryRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  categoryControl: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.lg,
  },
  controlLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  lockedFeed: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.surfaceLight,
  },
  lockedFeedText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    marginLeft: spacing.sm,
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
  iconButton: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
  },
  stepperLabel: {
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperValue: {
    ...textStyles.button,
    color: colors.textPrimary,
    minWidth: spacing.xl * 3,
    textAlign: 'center',
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  thisDeviceBadge: {
    backgroundColor: colors.surfaceLight,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.xs,
    marginLeft: spacing.sm,
  },
  thisDeviceBadgeText: {
    ...textStyles.caption,
    color: colors.primary,
  },
});

export default NotificationPreferencesPanel;
