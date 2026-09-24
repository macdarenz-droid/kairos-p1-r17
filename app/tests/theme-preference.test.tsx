import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyInitialTheme,
  defaultThemePreference,
  readThemePreference,
  ThemeProvider,
  themePreferenceStorageKey,
  useTheme,
  writeThemePreference,
} from '../src/design-system/themes';

function wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('P3.4 persistent theme preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-kairos-theme');
    document.documentElement.removeAttribute('style');
  });

  it('defaults to Ink when no valid preference is stored', () => {
    expect(readThemePreference()).toBe(defaultThemePreference);
    window.localStorage.setItem(themePreferenceStorageKey, 'future-theme');
    expect(readThemePreference()).toBe(defaultThemePreference);
  });

  it('persists only the selected preference value through the theme preference owner', () => {
    expect(writeThemePreference('cosmic')).toBe(true);
    expect(window.localStorage.getItem(themePreferenceStorageKey)).toBe('cosmic');
    expect(readThemePreference()).toBe('cosmic');
  });

  it('applies persisted preference before React renders', () => {
    writeThemePreference('ocean');
    expect(applyInitialTheme()).toBe('ocean');
    expect(document.documentElement.dataset.kairosTheme).toBe('ocean');
  });

  it('ThemeProvider updates presentation and persists a user selection', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.themeId).toBe('ink');

    act(() => result.current.setPreference('cosmic'));

    expect(result.current.preference).toBe('cosmic');
    expect(result.current.themeId).toBe('cosmic');
    expect(window.localStorage.getItem(themePreferenceStorageKey)).toBe('cosmic');
    expect(document.documentElement.dataset.kairosTheme).toBe('cosmic');
  });

  it('syncs preference when another same-origin browsing context changes storage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    window.localStorage.setItem(themePreferenceStorageKey, 'ocean');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: themePreferenceStorageKey,
        newValue: 'ocean',
        storageArea: window.localStorage,
      }));
    });

    expect(result.current.preference).toBe('ocean');
    expect(result.current.themeId).toBe('ocean');
  });

  it('falls back safely if browser persistence is unavailable', () => {
    const blockedStorage = {
      getItem() { throw new DOMException('blocked'); },
      setItem() { throw new DOMException('blocked'); },
    } as unknown as Storage;

    expect(readThemePreference(blockedStorage)).toBe(defaultThemePreference);
    expect(writeThemePreference('ocean', blockedStorage)).toBe(false);
  });
});
