/**
 * Human-readable device names for the Settings device list. Pure, so it is unit tested
 * (__tests__/deviceDescription.test.ts).
 */

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
