import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
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

const PHONE_DARK_QUERY = '(prefers-color-scheme: dark)';

/** Whether the phone is set to dark; a browser without `matchMedia` counts as dark (Kairos Depth, D5). */
function readPhoneDark(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_DARK_QUERY).matches : true;
}

function subscribePhoneDark(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(PHONE_DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function applyInitialTheme(root: HTMLElement = document.documentElement): ThemeId {
  const preference = readThemePreference();
  const themeId = resolveTheme(preference, readPhoneDark());
  applyTheme(root, themeId);
  return themeId;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference());
  const phoneDark = useSyncExternalStore(subscribePhoneDark, readPhoneDark, () => true);
  const themeId = resolveTheme(preference, phoneDark);

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
