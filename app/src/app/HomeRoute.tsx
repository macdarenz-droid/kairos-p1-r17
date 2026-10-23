import { useEffect, useRef, useState } from 'react';
import { Navigate, useInRouterContext } from 'react-router';
import { shouldOpenSetup } from '../application/setup/setupState';
import { knownTradedMarkets, loadTradedMarkets } from '../application/setup/tradedMarkets';
import type { MarketType } from '../domain/trades';
import { HomeDashboardYourTrades } from './HomeDashboardYourTrades';
import { HomeDashboardSwipePager } from './HomeDashboardSwipePager';
import './homeDashboardYourTrades.css';
import { HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime } from './HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime';
import { createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeProductPolicy';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { HomeDisciplineCard } from '../features/discipline/HomeDisciplineCard';
import { GettingStartedCard } from '../features/setup/GettingStartedCard';
import { PageHeader, Segmented } from '../design-system/primitives';

/** A stable default clock, as in GoalsRoute: a new function each render would reload the card. */
const wallClock = (): string => new Date().toISOString();

/** D223: Live Market shows crypto only, so a trader who does not trade crypto starts on "Your Trades". */
const viewFor = (markets: readonly MarketType[] | null | undefined): 'market' | 'trades' =>
  markets !== null && markets !== undefined && !markets.includes('crypto') ? 'trades' : 'market';

export function HomeRoute({ db = kairosDatabase, now = wallClock }: { readonly db?: KairosDatabase; readonly now?: () => string } = {}) {
  // Home shows at once, on the markets last known in this visit (the shell reads them at start).
  const [view,setViewState] = useState<'market'|'trades'>(() => viewFor(knownTradedMarkets(db)));
  const chosen = useRef(false);
  const control = useRef<HTMLDivElement>(null);
  const setView = (next: 'market' | 'trades') => { chosen.current = true; setViewState(next); };
  // D222: a fresh journal opens the setup in Home's place once the read answers (only ever on a first run).
  const inRouter = useInRouterContext();
  const [openSetup, setOpenSetup] = useState(false);
  useEffect(() => {
    let ignore = false;
    shouldOpenSetup(db).then(open => { if (!ignore && open) setOpenSetup(true); }, () => undefined);
    loadTradedMarkets(db).then(markets => { if (!ignore && !chosen.current) setViewState(viewFor(markets)); }, () => undefined);
    return () => { ignore = true; };
  }, [db]);
  const [configuration] = useState(() => createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration());
  // "Try again" remounts the live runtime with a new key; the configuration stays the same.
  const [attempt, setAttempt] = useState(0);

  return (
    <section
      className="kairos-route"
      aria-labelledby="kairos-route-home"
      data-kairos-home-dashboard="live-crypto-text-runtime"
    >
      <PageHeader title="Home" titleId="kairos-route-home" intro="Your markets and your trades at a glance." />
      {openSetup && inRouter ? <Navigate to="/setup" replace /> : null}
      {/* D224: after "Hide", focus goes to the dashboard control, the next thing on the page. */}
      <GettingStartedCard db={db} now={now} onHidden={() => control.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus()} />
      <div ref={control}>
      <Segmented label="Dashboard view" value={view} onChange={setView}
        options={[{ value: 'market', label: 'Live Market' }, { value: 'trades', label: 'Your Trades' }]} />
      </div>
      <HomeDashboardSwipePager view={view} onViewChange={setView}>
      {view==='market'?<section aria-labelledby="kairos-home-dashboard-heading">
        <h2 id="kairos-home-dashboard-heading">Crypto prices now</h2>
        <HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime
          key={attempt}
          configuration={configuration}
          visual
          onRetry={() => setAttempt(current => current + 1)}
        />
      </section>:<HomeDashboardYourTrades glance={<HomeDisciplineCard db={db} now={now} />}/>}
      </HomeDashboardSwipePager>
    </section>
  );
}
