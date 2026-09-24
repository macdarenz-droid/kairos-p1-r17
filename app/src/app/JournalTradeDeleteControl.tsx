import { useEffect, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import { deleteTradeRecord } from '../application/trades';
import type { KairosDatabase } from '../data/database';
import './journalTradeDelete.css';

interface Props {
  readonly entry: JournalHistoryEntry;
  readonly db: KairosDatabase;
  /** Called after the store changed (deleted, or already gone) with the notice the list should show. */
  readonly onDeleted: (notice: string) => Promise<void>;
}

type State = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'confirming' }> | Readonly<{ kind: 'deleting' }> | Readonly<{ kind: 'error'; message: string }>;

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** P30.2: the confirmed delete of one saved trade through the P30.1 command; the card, the list and the projections are refreshed by the owner that mounted it. */
export function JournalTradeDeleteControl({ entry, db, onDeleted }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const confirmRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.kind === 'confirming') confirmRef.current?.focus(); if (state.kind === 'error') errorRef.current?.focus(); }, [state]);
  const { symbol, id } = entry.trade;

  async function confirm(): Promise<void> {
    setState({ kind: 'deleting' });
    const result = await deleteTradeRecord(db, id);
    if (!result.ok && result.type === 'storage-error') { setState({ kind: 'error', message: `Kairos could not delete ${symbol}. Nothing was changed.` }); return; }
    setState({ kind: 'idle' });
    await onDeleted(result.ok
      ? `${symbol} deleted. ${plural(result.removed.executions, 'fill')} and ${plural(result.removed.fees, 'fee')} were removed with it.`
      : `${symbol} was already gone. The list has been refreshed.`);
  }

  return <div className="kairos-trade-delete" data-trade-delete={state.kind}>
    {state.kind === 'idle' || state.kind === 'error' ? <button type="button" className="kairos-trade-delete__trigger" onClick={() => setState({ kind: 'confirming' })}>Delete trade</button> : null}
    {state.kind === 'error' ? <p ref={errorRef} tabIndex={-1} role="alert" className="kairos-trade-delete__error">{state.message}</p> : null}
    {state.kind === 'confirming' || state.kind === 'deleting' ? <div ref={confirmRef} tabIndex={-1} role="group" aria-label={`Delete ${symbol}`} className="kairos-trade-delete__confirm">
      <p>Delete {symbol} for good? Its {plural(entry.executions.length, 'fill')} and {plural(entry.fees.length, 'fee')} go with it. A backup taken before this keeps it.</p>
      <div className="kairos-trade-delete__actions">
        <button type="button" className="kairos-trade-delete__confirm-button" disabled={state.kind === 'deleting'} onClick={() => { void confirm(); }}>{state.kind === 'deleting' ? 'Deleting…' : 'Delete for good'}</button>
        <button type="button" disabled={state.kind === 'deleting'} onClick={() => setState({ kind: 'idle' })}>Keep trade</button>
      </div>
    </div> : null}
  </div>;
}
