import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { loadDisciplineScore, type DisciplineScoreQueryResult } from '../../application/discipline';
import { loadStrategies, type LoadStrategiesResult } from '../../application/discipline/strategies';
import type { KairosDatabase } from '../../data/database';
import { Card } from '../../design-system/primitives';
import { CoachCard } from './CoachCard';
import { DisciplineListsEditor } from './DisciplineListsEditor';
import { DisciplineScorePanel, type DisciplineScorePanelState } from './DisciplineScorePanel';
import { GoalsProgressCard } from './GoalsProgressCard';
import './disciplineScore.css';

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function PartLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

type Loaded<T> = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error' }> | Readonly<{ kind: 'ready'; result: T }>;

/**
 * Reads one owner, and again when its inputs change (a refresh when the trader comes back to the app). Only the first
 * read shows loading; a later one keeps the last answer until the new one arrives, so nothing on the page goes away
 * and focus never falls to the page.
 */
function useLoaded<T>(read: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ kind: 'loading' });
  useEffect(() => {
    let ignore = false;
    read().then(result => { if (!ignore) setState({ kind: 'ready', result }); }, () => { if (!ignore) setState(current => (current.kind === 'ready' ? current : { kind: 'error' })); });
    return () => { ignore = true; };
    // The deps are the read's own inputs, given by the caller.
  }, deps);
  return state;
}

function scorePanelState(state: Loaded<DisciplineScoreQueryResult>): DisciplineScorePanelState {
  if (state.kind !== 'ready') return state;
  return state.result.kind === 'ready' ? { kind: 'ready', score: state.result.score } : { kind: 'error' };
}

function StrategiesBlock({ state }: { readonly state: Loaded<LoadStrategiesResult> }) {
  const titleId = useId();
  const strategies = state.kind === 'ready' && state.result.ok ? state.result.strategies : null;
  return <section className="kairos-discipline-part__block" aria-labelledby={titleId}>
    <h2 id={titleId}>Your strategies</h2>
    {state.kind === 'loading' ? <p>Loading your strategies…</p> : null}
    {state.kind === 'error' || (state.kind === 'ready' && !state.result.ok) ? <p role="alert">Kairos could not load your strategies.</p> : null}
    {strategies !== null && strategies.length === 0 ? <Card as="div"><p>No strategies yet.</p><p><PartLink to="/strategies">Add a strategy</PartLink></p></Card> : null}
    {strategies !== null && strategies.length > 0 ? <>
      <ul className="kairos-discipline-part__strategies">
        {strategies.map(strategy => <li key={strategy.id}>
          <span className="kairos-discipline-part__strategy-name">{strategy.name}</span>
          <span>{strategy.rules.length === 1 ? '1 rule' : `${strategy.rules.length} rules`}</span>
        </li>)}
      </ul>
      <p><PartLink to="/strategies">Manage your strategies</PartLink></p>
    </> : null}
  </section>;
}

/**
 * Analysis › Discipline (D220): this month's score and its parts, your goals, the coach, your strategies and your
 * checklist. Each block reads its own owner; nothing is worked out here.
 */
export function DisciplineOverview({ db, now, refreshRevision }: { readonly db: KairosDatabase; readonly now: () => string; readonly refreshRevision: number }) {
  const scoreTitleId = useId();
  const score = useLoaded(() => loadDisciplineScore(db, { now: now() }), [db, now, refreshRevision]);
  const strategies = useLoaded(() => loadStrategies(db), [db, refreshRevision]);
  const unconfigured = score.kind === 'ready' && score.result.kind === 'time-zone-unconfigured';
  return <div className="kairos-discipline-part">
    {unconfigured ? <section className="kairos-discipline-part__block" aria-labelledby={scoreTitleId}>
      <h2 id={scoreTitleId}>Your discipline this month</h2>
      <p>Your score counts the trades you closed this month, so it needs your time zone first. <PartLink to="/settings">Open Settings</PartLink></p>
    </section> : <DisciplineScorePanel state={scorePanelState(score)} periodLabel="this month" title="Your discipline this month" level={2} />}
    <p><PartLink to="/goals">See your goals and score month by month</PartLink></p>
    <GoalsProgressCard db={db} now={now} />
    <CoachCard db={db} scope="real" now={now} refreshRevision={refreshRevision} disciplineRevision={0} level={2} />
    <StrategiesBlock state={strategies} />
    <DisciplineListsEditor db={db} />
  </div>;
}
