import '../../src/shell.css';
import '../../src/design-system/accessibility.css';
import '../../src/design-system/tokens.css';
import '../../src/design-system/shell/navigationShell.css';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';
import { ThemeProvider, applyInitialTheme } from '../../src/design-system/themes';
import { kairosDatabase, openKairosDatabase } from '../../src/data/database';
import { createKairosDatabaseSnapshot } from '../../src/data/backup';
import { themePreferenceStorageKey } from '../../src/design-system/themes/themePreference';
import type { ThemeId } from '../../src/design-system/themes';
export async function readSavedFacts() { return (await createKairosDatabaseSnapshot(kairosDatabase)).payload; }
export function theme(id: ThemeId) {
  localStorage.setItem(themePreferenceStorageKey, id);
  window.dispatchEvent(new StorageEvent('storage', { key: themePreferenceStorageKey, newValue: id }));
}
export async function mount() {
  await openKairosDatabase(kairosDatabase); applyInitialTheme();
  createRoot(document.getElementById('analysis-test-root')!).render(<ThemeProvider><RouterProvider router={createBrowserRouter(appRoutes)} /></ThemeProvider>);
}
