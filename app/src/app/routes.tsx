import type { RouteObject } from 'react-router';
import { AppShellRoute } from './AppShell';
import { HomeRoute } from './HomeRoute';
import { MoreRoute } from './MoreRoute';
import { RouteError } from './RouteError';
import { NotFoundRoute } from '../features/shell/NotFoundRoute';

/** Shown only when the app starts on a screen whose code is still loading. */
function RouteLoading() {
  return <p className="kairos-route" role="status">Loading…</p>;
}

// Each screen's code loads when the screen opens; Home, More and not-found stay in the first script.
export const appRoutes = [
  {
    path: '/',
    Component: AppShellRoute,
    ErrorBoundary: RouteError,
    HydrateFallback: RouteLoading,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'journal', lazy: async () => ({ Component: (await import('./JournalRoute')).JournalRoute }) },
      { path: 'analysis', lazy: async () => ({ Component: (await import('./AnalysisRoute')).AnalysisRoute }) },
      { path: 'library', lazy: async () => ({ Component: (await import('./LibraryRoute')).LibraryRoute }) },
      { path: 'more', element: <MoreRoute /> },
      { path: 'practice', lazy: async () => ({ Component: (await import('./PracticeRoute')).PracticeRoute }) },
      { path: 'goals', lazy: async () => ({ Component: (await import('./GoalsRoute')).GoalsRoute }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('./SettingsRoute')).SettingsRoute }) },
      { path: 'profile', lazy: async () => ({ Component: (await import('./ProfileRoute')).ProfileRoute }) },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
] satisfies RouteObject[];
