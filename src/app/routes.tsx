import type { RouteObject } from 'react-router';
import { AppShell } from './AppShell';
import { MoreRoute } from './MoreRoute';
import { PlaceholderRoute } from './PlaceholderRoute';
import { RouteError } from './RouteError';

export const appRoutes = [
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    children: [
      { index: true, element: <PlaceholderRoute title="Home" /> },
      { path: 'journal', element: <PlaceholderRoute title="Journal" /> },
      { path: 'analysis', element: <PlaceholderRoute title="Analysis" /> },
      { path: 'library', element: <PlaceholderRoute title="Library" /> },
      { path: 'more', element: <MoreRoute /> },
      { path: 'practice', element: <PlaceholderRoute title="Practice" /> },
      { path: 'goals', element: <PlaceholderRoute title="Goals" /> },
      { path: 'settings', element: <PlaceholderRoute title="Settings" /> },
      { path: 'profile', element: <PlaceholderRoute title="Profile" /> },
      { path: '*', element: <PlaceholderRoute title="Page not found" /> },
    ],
  },
] satisfies RouteObject[];
