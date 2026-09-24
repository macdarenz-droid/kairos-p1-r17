import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { filterSavedRecordIndex, listSavedRecordIndex, type SavedRecordIndex, type SavedRecordIndexEntry, type SavedRecordKind } from '../application/library';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { analysisHandoffHref } from './analysisHandoff';
import './libraryRoute.css';

interface LibraryRouteProps {
  readonly db?: KairosDatabase;
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
export function LibraryRoute({ db = kairosDatabase }: LibraryRouteProps) {
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
    <div className="kairos-library__heading"><div><p className="kairos-library__eyebrow">Saved records</p><h1 id="kairos-library-title">Library</h1></div></div>
    {state.kind === 'loading' ? <p className="kairos-library__note">Loading your saved records…</p> : null}
    {state.kind === 'error' ? <p role="alert">Kairos could not load your saved records.</p> : null}
    {state.kind === 'ready' ? <>
      <p className="kairos-library__note">{state.index.counts.analyses === 1 ? '1 saved analysis' : `${state.index.counts.analyses} saved analyses`} and {state.index.counts.snapshots === 1 ? '1 saved snapshot' : `${state.index.counts.snapshots} saved snapshots`} across {state.index.markets.length === 1 ? '1 market' : `${state.index.markets.length} markets`}. Open one to load it in Analysis.</p>
      <div className="kairos-library__filters" role="group" aria-label="Library filters">
        <label><span>Kind</span><select aria-label="Record kind" value={kind} onChange={event => setKind(event.target.value as 'all' | SavedRecordKind)}><option value="all">All records</option><option value="analysis">Saved analyses</option><option value="snapshot">Saved snapshots</option></select></label>
        <label><span>Market</span><select aria-label="Record market" value={market} onChange={event => setMarket(event.target.value)}><option value="all">All markets</option>{state.index.markets.map(item => <option key={marketKey(item)} value={marketKey(item)}>{item.instrument} on {item.venue}</option>)}</select></label>
      </div>
      {entries.length === 0 ? <p className="kairos-library__empty" role="status">{state.index.entries.length === 0 ? 'Nothing saved yet. Save an analysis or a snapshot from the Analysis page and it will appear here.' : 'No saved records match these filters.'}</p>
        : <ul className="kairos-library__list">
          {entries.map(entry => <li key={`${entry.kind}:${entry.id}`} className="kairos-library__item" data-record-kind={entry.kind} data-record-id={entry.id}>
            <div className="kairos-library__item-body">
              <p className="kairos-library__item-title"><strong>{entry.label ?? shortId(entry.id)}</strong> <span className="kairos-library__kind">{entry.kind === 'analysis' ? 'Saved analysis' : 'Saved snapshot'}</span></p>
              <p className="kairos-library__item-facts">{entry.market.instrument} on {entry.market.venue} · {facts(entry)}{entry.label === null ? '' : ` · ${shortId(entry.id)}`}</p>
            </div>
            <Link className="kairos-library__open" to={analysisHandoffHref(entry.market, { kind: entry.kind, id: entry.id })} aria-label={`Open ${entry.label ?? shortId(entry.id)} in Analysis`}>Open in Analysis</Link>
          </li>)}
        </ul>}
    </> : null}
  </section>;
}
