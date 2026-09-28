import { useState } from 'react';
import { HomeDashboardYourTrades } from './HomeDashboardYourTrades';
import { HomeDashboardSwipePager } from './HomeDashboardSwipePager';
import './homeDashboardYourTrades.css';
import { HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime } from './HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime';
import { createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeProductPolicy';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { HomeDisciplineCard } from '../features/discipline/HomeDisciplineCard';
import { PageHeader, Segmented } from '../design-system/primitives';

/** A stable default clock, as in GoalsRoute: a new function each render would reload the card. */
const wallClock = (): string => new Date().toISOString();

export function HomeRoute({ db = kairosDatabase, now = wallClock }: { readonly db?: KairosDatabase; readonly now?: () => string } = {}) {
  const [view,setView] = useState<'market'|'trades'>('market');
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
      <Segmented label="Dashboard view" value={view} onChange={setView}
        options={[{ value: 'market', label: 'Live Market' }, { value: 'trades', label: 'Your Trades' }]} />
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
