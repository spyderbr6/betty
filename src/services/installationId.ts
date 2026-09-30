/**
 * A stable identifier for this app installation (or browser profile on web).
 *
 * Generated once and persisted, so push-token rows can be tied to the device that
 * registered them. Before this, deviceId was "Android-Device" / "iOS-Device" /
 * "web-<user agent>", which is shared by every device of that kind and made it
 * impossible to tell one phone's registrations from another's.
 *
 * AsyncStorage is backed by localStorage on web. If storage is unavailable the id
 * lives for this session only, which degrades to the old behaviour rather than failing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sidebet.installationId';

let cached: string | null = null;

function generateId(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `inst-${Date.now().toString(36)}-${random()}${random()}`;
}

export async function getInstallationId(): Promise<string> {
  if (cached) return cached;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch (error) {
    console.warn('[InstallationId] Could not read stored id:', error);
  }

  const id = generateId();
  cached = id;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch (error) {
    console.warn('[InstallationId] Could not persist id:', error);
  }
  return id;
}
