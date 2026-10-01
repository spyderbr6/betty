import type { AppSyncIdentityCognito, AppSyncResolverHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/device-registry';
import {
  type DevicePlatform,
  deviceExpiresAt,
  deviceIdFor,
  rowsToRelease,
  transportFor,
  validateRegistration,
} from './deviceLogic';

// CRITICAL: Top-level await configuration - this is required for proper client initialization
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Non-generic use, as in the other handlers, to avoid TS2590 on the generated model types.
const client = generateClient<Schema>() as any;

interface RegisterDeviceArgs {
  installationId: string;
  token: string;
  platform: DevicePlatform;
  deviceName?: string | null;
  appVersion?: string | null;
  timezone?: string | null;
}

interface UnregisterDeviceArgs {
  installationId: string;
}

type DeviceRegistryArgs = RegisterDeviceArgs | UnregisterDeviceArgs;

/**
 * Resolver for registerDevice and unregisterDevice. The caller's identity comes from
 * Cognito, never from the arguments, so a user can only touch their own devices.
 */
export const handler: AppSyncResolverHandler<DeviceRegistryArgs, string | boolean> = async (event) => {
  const userId = (event.identity as AppSyncIdentityCognito | null)?.sub;
  if (!userId) {
    throw new Error('Unauthorized');
  }

  switch (event.info.fieldName) {
    case 'registerDevice':
      return registerDevice(userId, event.arguments as RegisterDeviceArgs);
    case 'unregisterDevice':
      return unregisterDevice(userId, event.arguments as UnregisterDeviceArgs);
    default:
      throw new Error(`Unexpected field: ${event.info.fieldName}`);
  }
};

/**
 * Upsert the caller's PushDevice row for this installation, then release the token from
 * any other user's row. Returns the device id.
 */
async function registerDevice(userId: string, args: RegisterDeviceArgs): Promise<string> {
  const problem = validateRegistration(args);
  if (problem) {
    throw new Error(`Invalid registration: ${problem}`);
  }

  const now = new Date();
  const id = deviceIdFor(userId, args.installationId);
  const fields = {
    userId,
    installationId: args.installationId,
    platform: args.platform,
    transport: transportFor(args.platform),
    token: args.token,
    deviceName: args.deviceName ?? undefined,
    appVersion: args.appVersion ?? undefined,
    timezone: args.timezone ?? undefined,
    isActive: true,
    lastSeenAt: now.toISOString(),
    expiresAt: deviceExpiresAt(now),
  };

  const { data: existing } = await client.models.PushDevice.get({ id });
  // An update leaves pushEnabled alone: re-registering on sign-in must not override the
  // user's own switch for this device.
  const result = existing
    ? await client.models.PushDevice.update({ id, ...fields })
    : await client.models.PushDevice.create({ id, ...fields, pushEnabled: true, failureCount: 0 });

  if (result.errors?.length) {
    console.error('[DeviceRegistry] Write failed:', JSON.stringify(result.errors));
    throw new Error('Could not register device');
  }

  // A token belongs to whoever is signed in on that device now.
  const { data: sameToken } = await client.models.PushDevice.pushDevicesByToken({ token: args.token });
  const released = rowsToRelease(sameToken, id);
  await Promise.all(
    released.map((otherId) => client.models.PushDevice.update({ id: otherId, isActive: false }))
  );

  console.log(
    `[DeviceRegistry] ${existing ? 'Updated' : 'Created'} ${id} (${args.platform})` +
      (released.length ? `, released token from ${released.length} other row(s)` : '')
  );
  return id;
}

/** Deactivate the caller's row for this installation. True if a row was deactivated. */
async function unregisterDevice(userId: string, args: UnregisterDeviceArgs): Promise<boolean> {
  if (!args.installationId) {
    throw new Error('installationId is required');
  }
  const id = deviceIdFor(userId, args.installationId);
  const { data: existing } = await client.models.PushDevice.get({ id });
  if (!existing?.isActive) {
    return false;
  }
  await client.models.PushDevice.update({ id, isActive: false });
  console.log(`[DeviceRegistry] Deactivated ${id}`);
  return true;
}
