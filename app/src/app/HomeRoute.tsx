import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Navigate, useInRouterContext, useSearchParams } from 'react-router';
import { shouldOpenSetup } from '../application/setup/setupState';
import { knownTradedMarkets, loadTradedMarkets } from '../application/setup/tradedMarkets';
import type { MarketType } from '../domain/trades';
import { homeYourTradesChoice, type HomeYourTradesChoice } from '../application/dashboard/homeDashboardYourTradesQuery';
import { readVisualPnlPeriodChoice, VISUAL_PNL_DEFAULT_PERIOD, writeVisualPnlPeriodChoice } from '../application/visual-pnl';
import { HomeDashboardYourTrades } from './HomeDashboardYourTrades';
import { HomeDashboardSwipePager } from './HomeDashboardSwipePager';
import './homeDashboardYourTrades.css';
import { HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime } from './HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime';
import { createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeProductPolicy';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { NewsApiPort } from '../application/economic-calendar/fetchedNews';
import { HomeDisciplineCard } from '../features/discipline/HomeDisciplineCard';
import { TodayCard } from '../features/home/TodayCard';
import { BackupReminderCard } from '../features/backup/BackupReminderCard';
import { GettingStartedCard } from '../features/setup/GettingStartedCard';
import { InstallCard } from '../features/install/InstallCard';
import { PageHeader, Segmented } from '../design-system/primitives';

/** A stable default clock, as in GoalsRoute: a new function each render would reload the card. */
const wallClock = (): string => new Date().toISOString();

/** D223: Live Market shows crypto only, so a trader who does not trade crypto starts on "Your Trades". */
const viewFor = (markets: readonly MarketType[] | null | undefined): 'market' | 'trades' =>
  markets !== null && markets !== undefined && !markets.includes('crypto') ? 'trades' : 'market';

/** `news`: the Kairos server's news routes, built as the News page's (routes.tsx); "Today" refreshes the official schedules with them (D269). */
export function HomeRoute({ db = kairosDatabase, now = wallClock, news }: { readonly db?: KairosDatabase; readonly now?: () => string; readonly news?: NewsApiPort } = {}) {
  // Home shows at once, on the markets last known in this visit (read at start, before the app shows: main.tsx).
  const [startView, setStartView] = useState<HomeView>(() => viewFor(knownTradedMarkets(db)));
  const control = useRef<HTMLDivElement>(null);
  const install = useRef<HTMLDivElement>(null);
  const focusControl = () => control.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
  // D222: a fresh journal opens the setup in Home's place once the read answers (only ever on a first run).
  const inRouter = useInRouterContext();
  const [openSetup, setOpenSetup] = useState(false);
  useEffect(() => {
    let ignore = false;
    shouldOpenSetup(db).then(open => { if (!ignore && open) setOpenSetup(true); }, () => undefined);
    loadTradedMarkets(db).then(markets => { if (!ignore) setStartView(viewFor(markets)); }, () => undefined);
    return () => { ignore = true; };
  }, [db]);
  const [configuration] = useState(() => createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration());
  // "Try again" remounts the live runtime with a new key; the configuration stays the same.
  const [attempt, setAttempt] = useState(0);
  const market = <section aria-labelledby="kairos-home-dashboard-heading">
    <h2 id="kairos-home-dashboard-heading">Crypto prices now</h2>
    <HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime
      key={attempt}
      configuration={configuration}
      onRetry={() => setAttempt(current => current + 1)}
    />
  </section>;
  const views: HomeViewsProps = { db, now, startView, control, market };

  return (
    <section
      className="kairos-route"
      aria-labelledby="kairos-route-home"
      data-kairos-home-dashboard="live-crypto-text-runtime"
    >
      <PageHeader title="Home" titleId="kairos-route-home" intro="How you're doing today, and the markets now." />
      {openSetup && inRouter ? <Navigate to="/setup" replace /> : null}
      {/* D267: Home answers "how am I doing?" first, above the reminders and the dashboard view. */}
      <TodayCard db={db} now={now} news={news} />
      <BackupReminderCard db={db} now={now} />
      {/* D224: after "Hide", focus goes to the next thing on the page: the install card, or the dashboard control. */}
      <GettingStartedCard db={db} now={now} onHidden={() => { const next = install.current?.querySelector<HTMLElement>('button'); if (next) next.focus(); else focusControl(); }} />
      <div ref={install}><InstallCard db={db} now={now} onHidden={focusControl} /></div>
      {inRouter ? <HomeViewsInAddress {...views} /> : <HomeViews {...views} />}
    </section>
  );
}

type HomeView = 'market' | 'trades';
interface HomeViewsProps {
  readonly db: KairosDatabase;
  readonly now: () => string;
  /** D223's view, shown until one is chosen. */
  readonly startView: HomeView;
  /** The "Dashboard view" switch's box: focus goes there when a card above it hides (D224). */
  readonly control: RefObject<HTMLDivElement | null>;
  readonly market: ReactNode;
}
/** Home's view (null: none chosen) and the period of "Your Trades", as the address holds them. */
interface HomeAddress {
  readonly view: HomeView | null;
  readonly choice: HomeYourTradesChoice;
  readonly onViewChange: (view: HomeView) => void;
  readonly onChoiceChange: (choice: HomeYourTradesChoice) => void;
}

/**
 * D270: in a router, Home's view and the period of "Your Trades" live in the address (`/?view=trades&period=week`); each
 * change replaces the entry, so Back from a trade's page returns to the same bubbles. With no `view`, D223 picks the view
 * and the address stays `/`.
 */
function HomeViewsInAddress(props: HomeViewsProps) {
  const [params, setParams] = useSearchParams();
  const view = params.get('view');
  const replace = (next: (current: URLSearchParams) => URLSearchParams) => setParams(next, { replace: true });
  const address: HomeAddress = {
    view: view === 'market' || view === 'trades' ? view : null,
    choice: homeYourTradesChoice(readVisualPnlPeriodChoice(params)),
    onViewChange: next => replace(current => { const kept = new URLSearchParams(current); kept.set('view', next); return kept; }),
    // A period is chosen on "Your Trades", so the address names that view too.
    onChoiceChange: choice => replace(current => { const kept = writeVisualPnlPeriodChoice(choice, current); kept.set('view', 'trades'); return kept; }),
  };
  return <HomeViews {...props} address={address} />;
}

/** The "Dashboard view" switch and its two views; outside a router (no address) the view and the period live here. */
function HomeViews({ db, now, startView, control, market, address }: HomeViewsProps & { readonly address?: HomeAddress }) {
  const [ownView, setOwnView] = useState<HomeView | null>(null);
  const [ownChoice, setOwnChoice] = useState<HomeYourTradesChoice>(() => homeYourTradesChoice(VISUAL_PNL_DEFAULT_PERIOD));
  const view = (address === undefined ? ownView : address.view) ?? startView;
  const setView = address?.onViewChange ?? setOwnView;
  return <>
    <div ref={control}>
    <Segmented label="Dashboard view" value={view} onChange={setView}
      options={[{ value: 'market', label: 'Live Market' }, { value: 'trades', label: 'Your Trades' }]} />
    </div>
    <HomeDashboardSwipePager view={view} onViewChange={setView}>
    {view === 'market' ? market : <HomeDashboardYourTrades db={db} now={now} choice={address?.choice ?? ownChoice} onChoiceChange={address?.onChoiceChange ?? setOwnChoice}
      glance={<HomeDisciplineCard db={db} now={now} />} />}
    </HomeDashboardSwipePager>
  </>;
}
