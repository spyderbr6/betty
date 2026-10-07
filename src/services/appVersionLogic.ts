/**
 * The minimum-version gate (docs/SECURITY_PLAN.md step 4): an installed app older than
 * AppConfig.minimumVersion shows only an "update the app" screen. Free of Amplify imports
 * so it is unit tested.
 */

/** Numeric parts of "1.2.3" (missing or non-numeric parts count as 0). */
function parts(version: string): number[] {
  return version.trim().split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** Negative if a < b, 0 if equal, positive if a > b. "1.2" equals "1.2.0". */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Whether this app must update. Anything unknown lets the app through: an unreadable
 * config or version must not lock everyone out.
 */
export function isUpdateRequired(current: string | null | undefined, minimum: string | null | undefined): boolean {
  if (!current || !minimum) return false;
  if (!/^\d+(\.\d+)*$/.test(current.trim()) || !/^\d+(\.\d+)*$/.test(minimum.trim())) return false;
  return compareVersions(current, minimum) < 0;
}
