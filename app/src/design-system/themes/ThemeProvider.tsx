import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { applyTheme, resolveTheme } from './themeEngine';
import type { ThemeId, ThemePreference } from './themeEngine';
import {
  defaultThemePreference,
  readThemePreference,
  themePreferenceStorageKey,
  writeThemePreference,
} from './themePreference';

type ThemeContextValue = Readonly<{
  preference: ThemePreference;
  themeId: ThemeId;
  setPreference: (preference: ThemePreference) => void;
}>;

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function applyInitialTheme(root: HTMLElement = document.documentElement): ThemeId {
  const preference = readThemePreference();
  const themeId = resolveTheme(preference, true);
  applyTheme(root, themeId);
  return themeId;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference());
  const themeId = resolveTheme(preference, true);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    writeThemePreference(nextPreference);
    setPreferenceState(nextPreference);
  }, []);

  useEffect(() => {
    applyTheme(document.documentElement, themeId);
  }, [themeId]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== themePreferenceStorageKey) return;
      setPreferenceState(readThemePreference());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, themeId, setPreference }),
    [preference, setPreference, themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }
  return value;
}

export { defaultThemePreference };
