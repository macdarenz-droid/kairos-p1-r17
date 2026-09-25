import type { RouteObject } from 'react-router';
import { AppShellRoute } from './AppShell';
import { HomeRoute } from './HomeRoute';
import { MoreRoute } from './MoreRoute';
import { RouteError } from './RouteError';
import { NotFoundRoute } from '../features/shell/NotFoundRoute';
import { kairosDatabase } from '../data/database';
import { createTradePictureCandleBrowserDeps } from './tradePictureCandleBrowserDeps';
import { ReviewTradeLink } from './ReviewTradeLink';

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
      { path: 'library/words', lazy: async () => ({ Component: (await import('../features/learn/GlossaryScreen')).GlossaryScreen }) },
      { path: 'library/calculators', lazy: async () => ({ Component: (await import('../features/learn/CalculatorsScreen')).CalculatorsScreen }) },
      { path: 'library/lessons', lazy: async () => ({ Component: (await import('../features/learn/LessonListScreen')).LessonListScreen }) },
      { path: 'library/lessons/:lessonId', lazy: async () => ({ Component: (await import('../features/learn/LessonReaderScreen')).LessonReaderScreen }) },
      { path: 'more', element: <MoreRoute /> },
      { path: 'practice', lazy: async () => ({ Component: (await import('./PracticeRoute')).PracticeRoute }) },
      { path: 'practice/replay', lazy: async () => {
        const { ReplayScreen } = await import('../features/practice/ReplayScreen');
        const market = createTradePictureCandleBrowserDeps();
        return { Component: function PracticeReplayRoute() { return <ReplayScreen db={kairosDatabase} market={market} />; } };
      } },
      { path: 'practice/coach', lazy: async () => {
        const { CoachScreen } = await import('../features/discipline/CoachScreen');
        return { Component: function PracticeCoachRoute() { return <CoachScreen db={kairosDatabase} scope="practice" renderTradeLink={id => <ReviewTradeLink id={id} />} />; } };
      } },
      { path: 'practice/patterns', lazy: async () => {
        const { PatternsScreen } = await import('../features/patterns/PatternsScreen');
        return { Component: function PracticePatternsRoute() { return <PatternsScreen db={kairosDatabase} scope="practice" />; } };
      } },
      { path: 'goals', lazy: async () => ({ Component: (await import('./GoalsRoute')).GoalsRoute }) },
      { path: 'strategies', lazy: async () => {
        const { StrategiesScreen } = await import('../features/discipline/StrategiesScreen');
        return { Component: function StrategiesRoute() { return <StrategiesScreen db={kairosDatabase} />; } };
      } },
      { path: 'coach', lazy: async () => {
        const { CoachScreen } = await import('../features/discipline/CoachScreen');
        return { Component: function CoachRoute() { return <CoachScreen db={kairosDatabase} scope="real" renderTradeLink={id => <ReviewTradeLink id={id} />} />; } };
      } },
      { path: 'patterns', lazy: async () => {
        const { PatternsScreen } = await import('../features/patterns/PatternsScreen');
        return { Component: function PatternsRoute() { return <PatternsScreen db={kairosDatabase} scope="real" />; } };
      } },
      { path: 'currency', lazy: async () => {
        const { CurrencyScreen } = await import('../features/currency/CurrencyScreen');
        return { Component: function CurrencyRoute() { return <CurrencyScreen db={kairosDatabase} />; } };
      } },
      { path: 'settings', lazy: async () => ({ Component: (await import('./SettingsRoute')).SettingsRoute }) },
      { path: 'profile', lazy: async () => ({ Component: (await import('./ProfileRoute')).ProfileRoute }) },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
] satisfies RouteObject[];
