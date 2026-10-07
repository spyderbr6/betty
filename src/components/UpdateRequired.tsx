/**
 * The minimum-version gate (docs/SECURITY_PLAN.md step 4). At launch the app reads
 * AppConfig 'global' (written by the owner in the console); if this build is older than
 * its minimumVersion, this screen replaces the whole app. Older builds write money records
 * the server no longer accepts, so they must not keep running.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { isUpdateRequired } from '../services/appVersionLogic';
import { colors, spacing, textStyles, commonStyles } from '../styles';

const client = generateClient<Schema>();

export interface RequiredUpdate {
  updateUrl?: string | null;
  updateMessage?: string | null;
}

/** Null while unknown or when this build is current: the app is never held up waiting. */
export function useRequiredUpdate(): RequiredUpdate | null {
  const [required, setRequired] = useState<RequiredUpdate | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // identityPool: readable signed out (guest) and signed in alike
        const { data } = await client.models.AppConfig.get({ id: 'global' }, { authMode: 'identityPool' });
        const current = Constants.expoConfig?.version;
        if (!cancelled && data && isUpdateRequired(current, data.minimumVersion)) {
          setRequired({ updateUrl: data.updateUrl, updateMessage: data.updateMessage });
        }
      } catch (error) {
        // Unreadable config: let the app through rather than lock everyone out
        console.warn('[UpdateRequired] Could not read the minimum version:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return required;
}

export function UpdateRequired({ updateUrl, updateMessage }: RequiredUpdate) {
  return (
    <SafeAreaView style={styles.container} testID="update-required">
      <View style={styles.content}>
        <Text style={styles.title}>Update Required</Text>
        <Text style={styles.message}>
          {updateMessage || 'This version of SideBet is no longer supported. Please install the latest version to keep using the app.'}
        </Text>
        {updateUrl ? (
          <TouchableOpacity style={styles.button} onPress={() => Linking.openURL(updateUrl)} testID="update-required-link">
            <Text style={styles.buttonText}>Get the Update</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    ...textStyles.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  message: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  button: {
    ...commonStyles.primaryButton,
  },
  buttonText: {
    ...textStyles.button,
    color: colors.background,
  },
});
