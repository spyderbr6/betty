/**
 * Pure decision logic for push-token registration, kept free of React Native and
 * Amplify imports so it can be unit tested (see __tests__/pushRegistrationLogic.test.ts).
 *
 * Registration used to `create` a PushToken row on every app launch, resume, sign-in
 * and hourly token refresh. A single device collected dozens of active rows for the
 * same token and received one push per row. These functions turn registration into
 * an upsert keyed on the token value, and scope sign-out to the current device.
 */

export interface PushTokenRow {
  id: string;
  token?: string | null;
  deviceId?: string | null;
  isActive?: boolean | null;
  lastUsed?: string | null;
}

export interface TokenUpsertPlan {
  /** No row holds this token yet: create one. */
  create: boolean;
  /** The row to keep for this token, when one exists. */
  keepId?: string;
  /** The kept row is inactive or stale and should be re-activated / re-stamped. */
  touchKept: boolean;
  /** Other active rows holding the same token: duplicates to deactivate. */
  deactivateIds: string[];
}

/** Re-stamp lastUsed at most this often, so a registration on every resume costs a read, not a write. */
export const TOKEN_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function timeOf(iso?: string | null): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Decide how to record `token` for a user, given the user's existing rows.
 *
 * Keeps one row per token: prefers an active row, then the most recently used.
 * Every other *active* row with the same token is a duplicate and is deactivated.
 */
export function planTokenUpsert(
  rows: PushTokenRow[],
  token: string,
  now: Date,
  touchIntervalMs: number = TOKEN_TOUCH_INTERVAL_MS
): TokenUpsertPlan {
  const matches = rows.filter((r) => r.token === token);
  if (matches.length === 0) {
    return { create: true, touchKept: false, deactivateIds: [] };
  }

  const [kept] = [...matches].sort((a, b) => {
    const activeDiff = Number(!!b.isActive) - Number(!!a.isActive);
    if (activeDiff !== 0) return activeDiff;
    return timeOf(b.lastUsed) - timeOf(a.lastUsed);
  });

  const stale = now.getTime() - timeOf(kept.lastUsed) >= touchIntervalMs;

  return {
    create: false,
    keepId: kept.id,
    touchKept: !kept.isActive || stale,
    deactivateIds: matches.filter((r) => r.id !== kept.id && r.isActive).map((r) => r.id),
  };
}

/**
 * Rows to deactivate when this device signs out: active rows holding this device's
 * token, or tagged with this installation's id. Never touches the user's other devices.
 */
export function rowsForDeviceSignOut(
  rows: PushTokenRow[],
  device: { token?: string | null; installationId?: string | null }
): string[] {
  return rows
    .filter((r) => r.isActive)
    .filter(
      (r) =>
        (!!device.token && r.token === device.token) ||
        (!!device.installationId && r.deviceId === device.installationId)
    )
    .map((r) => r.id);
}

/**
 * A short, human-readable name for a browser, from its user agent: "Chrome on Windows".
 * Shown in Settings' device list. Order matters: Edge and Opera also claim "Chrome",
 * and Chrome claims "Safari".
 */
export function describeUserAgent(userAgent: string): string {
  const ua = userAgent || '';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Macintosh|Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '';
  return os ? `${browser} on ${os}` : browser;
}
