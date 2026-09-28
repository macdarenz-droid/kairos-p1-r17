import { defaultThemeId, themeIds } from './themeEngine';
import type { ThemePreference } from './themeEngine';

export const themePreferenceStorageKey = 'kairos.theme.preference.v1';
export const defaultThemePreference: ThemePreference = defaultThemeId;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || (value !== null && (themeIds as readonly string[]).includes(value));
}

export function readThemePreference(storage: Storage | null = getBrowserStorage()): ThemePreference {
  if (!storage) return defaultThemePreference;
  try {
    const stored = storage.getItem(themePreferenceStorageKey);
    return isThemePreference(stored) ? stored : defaultThemePreference;
  } catch {
    return defaultThemePreference;
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: Storage | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(themePreferenceStorageKey, preference);
    return true;
  } catch {
    return false;
  }
}

export function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
