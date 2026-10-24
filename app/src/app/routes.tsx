import { useRouteError, type RouteObject } from 'react-router';
import { AppShellRoute } from './AppShell';
import { HomeRoute } from './HomeRoute';
import { MoreRoute } from './MoreRoute';
import { RouteError } from './RouteError';
import { NotFoundRoute } from '../features/shell/NotFoundRoute';
import { kairosDatabase } from '../data/database';
import { createTradePictureCandleBrowserDeps } from './tradePictureCandleBrowserDeps';
import { ReviewTradeLink } from './ReviewTradeLink';
import { kairosRepositories } from '../data/repositories';
import { ActivationReceiptRepository } from '../services/activation';

/** Shown only when the app starts on a screen whose code is still loading. */
function RouteLoading() {
  return <p className="kairos-route" role="status">Loading…</p>;
}

/** e2e (ab): a page that crashes on purpose, in the QA build only (`e2e/qa-build.mjs`); a release build drops it. */
function QaCrash(): never {
  throw new Error('QA crash on purpose (e2e)');
}
/** Hands the crash past the router, so the app's crash screen shows it. */
function QaCrashOnward(): never {
  throw useRouteError();
}
const QA_ROUTES: RouteObject[] = import.meta.env.VITE_BUILD_ID === 'qa-e2e' ? [{ path: '/qa/crash', Component: QaCrash, ErrorBoundary: QaCrashOnward }] : [];

// Each screen's code loads when the screen opens; Home, More and not-found stay in the first script.
/** U1: the app's Kairos server client (address from VITE_KAIROS_API_URL, device header from this device's receipt), the same for every screen that talks to the server. */
function kairosApiClientFrom(kairosApi: typeof import('../services/kairos-api/kairosApi')) {
  return kairosApi.createKairosApiClient({ baseUrl: kairosApi.parseKairosApiBaseUrl(import.meta.env.VITE_KAIROS_API_URL), readReceipt: kairosApi.storedReceiptReader(new ActivationReceiptRepository(kairosRepositories.metadata)) });
}

export const appRoutes = [
  {
    path: '/',
    Component: AppShellRoute,
    ErrorBoundary: RouteError,
    HydrateFallback: RouteLoading,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'journal', lazy: async () => ({ Component: (await import('./JournalRoute')).JournalRoute }) },
      // D258: the log page wears the Journal page's look (its form, fields and Save), so it loads the Journal's styles too.
      { path: 'journal/log', lazy: async () => {
        const [{ LogTradeScreen }] = await Promise.all([import('../features/journal/LogTradeScreen'), import('./journalRoute.css')]);
        return { Component: LogTradeScreen };
      } },
      // D260: a trade's own page wears the Journal's look for its controls and Analysis's for its details.
      { path: 'journal/trades/:id', lazy: async () => {
        const [{ TradePageScreen }] = await Promise.all([import('../features/journal/TradePageScreen'), import('./journalRoute.css'), import('./tradeReview.css')]);
        return { Component: function JournalTradePageRoute() { return <TradePageScreen scope="real" />; } };
      } },
      { path: 'analysis', lazy: async () => {
        const [{ AnalysisRoute }, { createEcbReferenceRatesPort }] = await Promise.all([import('./AnalysisRoute'), import('../services/exchange-rates/ecbReferenceRates')]);
        const rates = createEcbReferenceRatesPort();
        return { Component: function AnalysisWithRatesRoute() { return <AnalysisRoute rates={rates} />; } };
      } },
      { path: 'library', lazy: async () => ({ Component: (await import('./LibraryRoute')).LibraryRoute }) },
      { path: 'library/words', lazy: async () => ({ Component: (await import('../features/learn/GlossaryScreen')).GlossaryScreen }) },
      { path: 'library/calculators', lazy: async () => ({ Component: (await import('../features/learn/CalculatorsScreen')).CalculatorsScreen }) },
      { path: 'library/lessons', lazy: async () => ({ Component: (await import('../features/learn/LessonListScreen')).LessonListScreen }) },
      { path: 'library/lessons/:lessonId', lazy: async () => ({ Component: (await import('../features/learn/LessonReaderScreen')).LessonReaderScreen }) },
      { path: 'more', element: <MoreRoute /> },
      { path: 'practice', lazy: async () => {
        const [{ PracticeRoute }, { createEcbReferenceRatesPort }] = await Promise.all([import('./PracticeRoute'), import('../services/exchange-rates/ecbReferenceRates')]);
        const rates = createEcbReferenceRatesPort();
        return { Component: function PracticeWithRatesRoute() { return <PracticeRoute rates={rates} />; } };
      } },
      { path: 'practice/trades/:id', lazy: async () => {
        const [{ TradePageScreen }] = await Promise.all([import('../features/journal/TradePageScreen'), import('./journalRoute.css'), import('./tradeReview.css')]);
        return { Component: function PracticeTradePageRoute() { return <TradePageScreen scope="practice" />; } };
      } },
      { path: 'practice/replay', lazy: async () => {
        const { ReplayScreen } = await import('../features/practice/ReplayScreen');
        const market = createTradePictureCandleBrowserDeps();
        return { Component: function PracticeReplayRoute() { return <ReplayScreen db={kairosDatabase} market={market} />; } };
      } },
      { path: 'practice/coach', lazy: async () => {
        const { CoachScreen } = await import('../features/discipline/CoachScreen');
        return { Component: function PracticeCoachRoute() { return <CoachScreen db={kairosDatabase} scope="practice" renderTradeLink={id => <ReviewTradeLink id={id} scope="practice" />} />; } };
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
      { path: 'news-calendar', lazy: async () => {
        const [{ NewsCalendarScreen }, kairosApi, { createNewsApiPort }] = await Promise.all([import('../features/economic-calendar/NewsCalendarScreen'), import('../services/kairos-api/kairosApi'), import('../services/kairos-api/newsApi')]);
        const news = createNewsApiPort(kairosApiClientFrom(kairosApi));
        return { Component: function NewsCalendarRoute() { return <NewsCalendarScreen db={kairosDatabase} news={news} />; } };
      } },
      { path: 'currency', lazy: async () => {
        const [{ CurrencyScreen }, { createEcbReferenceRatesPort }] = await Promise.all([import('../features/currency/CurrencyScreen'), import('../services/exchange-rates/ecbReferenceRates')]);
        const rates = createEcbReferenceRatesPort();
        return { Component: function CurrencyRoute() { return <CurrencyScreen db={kairosDatabase} rates={rates} />; } };
      } },
      { path: 'settings', lazy: async () => ({ Component: (await import('./SettingsRoute')).SettingsRoute }) },
      { path: 'setup', lazy: async () => {
        const [{ SetupScreen }, { readDeviceTimeZone }] = await Promise.all([import('../features/setup/SetupScreen'), import('../features/settings/DeviceTimeZoneButton')]);
        return { Component: function SetupRoute() { return <SetupScreen db={kairosDatabase} deviceTimeZone={readDeviceTimeZone()} languages={navigator.languages} />; } };
      } },
      { path: 'backup', lazy: async () => {
        const { BackupScreen } = await import('../features/backup/BackupScreen');
        return { Component: function BackupRoute() { return <BackupScreen db={kairosDatabase} />; } };
      } },
      { path: 'profile', lazy: async () => {
        const [{ ProfileRoute }, kairosApi] = await Promise.all([import('./ProfileRoute'), import('../services/kairos-api/kairosApi')]);
        const client = kairosApiClientFrom(kairosApi);
        const onlineServices = kairosApi.createKairosApiHealthPort(client);
        return { Component: function ProfileWithOnlineServicesRoute() { return <ProfileRoute onlineServices={onlineServices} />; } };
      } },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
  ...QA_ROUTES,
] satisfies RouteObject[];
