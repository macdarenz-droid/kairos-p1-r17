import { useState } from 'react';
import { HomeDashboardYourTrades } from './HomeDashboardYourTrades';
import { HomeDashboardSwipePager } from './HomeDashboardSwipePager';
import './homeDashboardYourTrades.css';
import { HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime } from './HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime';
import { createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeProductPolicy';

export function HomeRoute() {
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
      <header>
        <h1 id="kairos-route-home">Home</h1>
        <p>Your Kairos dashboard lives here.</p>
      </header>
      <div className="kairos-home-switch" role="group" aria-label="Dashboard view" data-view={view}>
        <span className="kairos-home-switch__ink" aria-hidden="true" />
        <button type="button" aria-pressed={view==='market'} onClick={()=>setView('market')}>Live Market</button>
        <button type="button" aria-pressed={view==='trades'} onClick={()=>setView('trades')}>Your Trades</button>
      </div>
      <HomeDashboardSwipePager view={view} onViewChange={setView}>
      {view==='market'?<section aria-labelledby="kairos-home-dashboard-heading">
        <h2 id="kairos-home-dashboard-heading">Live Crypto Bubble</h2>
        <HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime
          key={attempt}
          configuration={configuration}
          visual
          onRetry={() => setAttempt(current => current + 1)}
        />
      </section>:<HomeDashboardYourTrades/>}
      </HomeDashboardSwipePager>
    </section>
  );
}
