import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { filterSavedRecordIndex, listSavedRecordIndex, type LearningSourceDevice, type SavedRecordIndex, type SavedRecordIndexEntry, type SavedRecordKind } from '../application/library';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { LearningSources } from '../features/library/LearningSources';
import { analysisHandoffHref } from './analysisHandoff';
import './libraryRoute.css';

interface LibraryRouteProps {
  readonly db?: KairosDatabase;
  /** The device for learning sources; tests inject a fake. */
  readonly learningSourceDevice?: LearningSourceDevice;
}

type State =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error' }>
  | Readonly<{ kind: 'ready'; index: SavedRecordIndex }>;

const shortId = (id: string): string => id.slice(0, 8);
const utcClock = (iso: string): string => iso.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const marketKey = (market: Readonly<{ venue: string; instrument: string }>): string => `${market.venue}:${market.instrument}`;

function facts(entry: SavedRecordIndexEntry): string {
  if (entry.kind === 'analysis') return `${entry.drawingCount === 1 ? '1 drawing' : `${entry.drawingCount} drawings`}${entry.riskRewardCount > 0 ? ` · ${entry.riskRewardCount === 1 ? '1 risk box' : `${entry.riskRewardCount} risk boxes`}` : ''}`;
  return `${entry.side === 'long' ? 'Long' : 'Short'} · opened ${utcClock(entry.openedAtUtc)}${entry.closedAtUtc === null ? ' · still open' : ''} · saved ${utcClock(entry.savedAt)}`;
}

/** Library: every saved record across markets, from the released P27.1 index; opening one hands it to Analysis. */
export function LibraryRoute({ db = kairosDatabase, learningSourceDevice }: LibraryRouteProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [kind, setKind] = useState<'all' | SavedRecordKind>('all');
  const [market, setMarket] = useState('all');

  useEffect(() => {
    let ignore = false;
    listSavedRecordIndex(db).then(index => { if (!ignore) setState({ kind: 'ready', index }); }, () => { if (!ignore) setState({ kind: 'error' }); });
    return () => { ignore = true; };
  }, [db]);

  const entries = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const selectedMarket = state.index.markets.find(item => marketKey(item) === market);
    return filterSavedRecordIndex(state.index, { ...(kind === 'all' ? {} : { kind }), ...(selectedMarket === undefined ? {} : { market: selectedMarket }) });
  }, [state, kind, market]);

  return <section className="kairos-route kairos-library" aria-labelledby="kairos-library-title" data-library-status={state.kind} data-library-count={state.kind === 'ready' ? entries.length : undefined}>
    <div className="kairos-library__heading"><div><h1 id="kairos-library-title">Library</h1></div></div>
    <section className="kairos-library__section" aria-labelledby="kairos-library-learn-title">
      <h2 id="kairos-library-learn-title">Learn the basics</h2>
      <ul className="kairos-library__learn">
        <li><Link className="kairos-library__learn-link" to="/library/words"><strong>Trading words</strong><span>What the words on screen mean, and what traders call them.</span></Link></li>
        <li><Link className="kairos-library__learn-link" to="/library/calculators"><strong>Calculators</strong><span>Work out how much you can buy for the risk you choose.</span></Link></li>
      </ul>
    </section>
    <section className="kairos-library__section" aria-labelledby="kairos-library-saved-title">
    <h2 id="kairos-library-saved-title">Your saved charts</h2>
    {state.kind === 'loading' ? <p className="kairos-library__note">Loading your saved charts…</p> : null}
    {state.kind === 'error' ? <p role="alert">Kairos could not load your saved charts.</p> : null}
    {state.kind === 'ready' ? <>
      <p className="kairos-library__note">{state.index.counts.analyses === 1 ? '1 saved analysis' : `${state.index.counts.analyses} saved analyses`} and {state.index.counts.snapshots === 1 ? '1 trade estimated from time' : `${state.index.counts.snapshots} trades estimated from time`} across {state.index.markets.length === 1 ? '1 market' : `${state.index.markets.length} markets`}. Open one to load it in Analysis.</p>
      <div className="kairos-library__filters" role="group" aria-label="Library filters">
        <label><span>Kind</span><select aria-label="Record kind" value={kind} onChange={event => setKind(event.target.value as 'all' | SavedRecordKind)}><option value="all">All records</option><option value="analysis">Saved analyses</option><option value="snapshot">Trades estimated from time</option></select></label>
        <label><span>Market</span><select aria-label="Record market" value={market} onChange={event => setMarket(event.target.value)}><option value="all">All markets</option>{state.index.markets.map(item => <option key={marketKey(item)} value={marketKey(item)}>{item.instrument} on {item.venue}</option>)}</select></label>
      </div>
      {entries.length === 0 ? <p className="kairos-library__empty" role="status">{state.index.entries.length === 0 ? 'Nothing saved yet. Save an analysis or a trade estimated from time on the Analysis page and it will appear here.' : 'No saved charts match these filters.'}</p>
        : <ul className="kairos-library__list">
          {entries.map(entry => <li key={`${entry.kind}:${entry.id}`} className="kairos-library__item" data-record-kind={entry.kind} data-record-id={entry.id}>
            <div className="kairos-library__item-body">
              <p className="kairos-library__item-title"><strong>{entry.label ?? shortId(entry.id)}</strong> <span className="kairos-library__kind">{entry.kind === 'analysis' ? 'Saved analysis' : 'Trade estimated from time'}</span></p>
              <p className="kairos-library__item-facts">{entry.market.instrument} on {entry.market.venue} · {facts(entry)}{entry.label === null ? '' : ` · ${shortId(entry.id)}`}</p>
            </div>
            <Link className="kairos-library__open" to={analysisHandoffHref(entry.market, { kind: entry.kind, id: entry.id })} aria-label={`Open ${entry.label ?? shortId(entry.id)} in Analysis`}>Open in Analysis</Link>
          </li>)}
        </ul>}
    </> : null}
    </section>
    <LearningSources device={learningSourceDevice} />
  </section>;
}
