/**
 * Pure decision logic for device registration, kept out of the handler so it can be
 * tested (the handler configures Amplify with a top-level await and imports
 * `$amplify/env/...`, so it cannot be imported by a test).
 */

export type DevicePlatform = 'IOS' | 'ANDROID' | 'WEB';
export type DeviceTransport = 'EXPO' | 'WEBPUSH';

/** Devices not seen for this long are removed by DynamoDB TTL. */
export const DEVICE_RETENTION_DAYS = 120;

const MAX_TOKEN_LENGTH = 2048; // Also the DynamoDB limit for a GSI partition key (pushDevicesByToken).
const INSTALLATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

export interface RegistrationArgs {
  installationId?: string | null;
  token?: string | null;
  platform?: string | null;
}

/** A reason to reject the registration, or null when it is acceptable. */
export function validateRegistration(args: RegistrationArgs): string | null {
  if (!args.installationId || !INSTALLATION_ID.test(args.installationId)) {
    return 'installationId is missing or malformed';
  }
  if (!args.token || args.token.length > MAX_TOKEN_LENGTH) {
    return 'token is missing or too long';
  }
  if (args.platform !== 'IOS' && args.platform !== 'ANDROID' && args.platform !== 'WEB') {
    return 'platform must be IOS, ANDROID or WEB';
  }
  return null;
}

/** Deterministic, so registering the same installation twice updates one row. */
export function deviceIdFor(userId: string, installationId: string): string {
  return `${userId}#${installationId}`;
}

export function transportFor(platform: DevicePlatform): DeviceTransport {
  return platform === 'WEB' ? 'WEBPUSH' : 'EXPO';
}

/** Epoch seconds for the device row's TTL, pushed forward on every registration. */
export function deviceExpiresAt(now: Date): number {
  return Math.floor(now.getTime() / 1000) + DEVICE_RETENTION_DAYS * 24 * 60 * 60;
}

export interface DeviceRow {
  id?: string | null;
  isActive?: boolean | null;
}

/**
 * Other active rows holding the token just registered. A token belongs to one device and
 * one signed-in user: when a phone or browser changes hands, the previous user's row must
 * stop receiving pushes on it.
 */
export function rowsToRelease(rowsWithToken: DeviceRow[] | null | undefined, keepId: string): string[] {
  return (rowsWithToken ?? [])
    .filter((r) => r.isActive && r.id && r.id !== keepId)
    .map((r) => r.id as string);
}
