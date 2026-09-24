import type { RouteObject } from 'react-router';
import { AppShellRoute } from './AppShell';
import { JournalRoute } from './JournalRoute';
import { LibraryRoute } from './LibraryRoute';
import { AnalysisRoute } from './AnalysisRoute';
import { GoalsRoute } from './GoalsRoute';
import { HomeRoute } from './HomeRoute';
import { MoreRoute } from './MoreRoute';
import { PracticeRoute } from './PracticeRoute';
import { ProfileRoute } from './ProfileRoute';
import { RouteError } from './RouteError';
import { SettingsRoute } from './SettingsRoute';
import { NotFoundRoute } from '../features/shell/NotFoundRoute';

export const appRoutes = [
  {
    path: '/',
    Component: AppShellRoute,
    ErrorBoundary: RouteError,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'journal', element: <JournalRoute /> },
      { path: 'analysis', element: <AnalysisRoute /> },
      { path: 'library', element: <LibraryRoute /> },
      { path: 'more', element: <MoreRoute /> },
      { path: 'practice', element: <PracticeRoute /> },
      { path: 'goals', element: <GoalsRoute /> },
      { path: 'settings', element: <SettingsRoute /> },
      { path: 'profile', element: <ProfileRoute /> },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
] satisfies RouteObject[];
