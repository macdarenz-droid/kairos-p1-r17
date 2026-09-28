import { useEffect, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import { deleteTradeRecord } from '../application/trades';
import type { KairosDatabase } from '../data/database';
import { ConfirmDialog } from '../design-system/primitives';
import './journalTradeDelete.css';

interface Props {
  readonly entry: JournalHistoryEntry;
  readonly db: KairosDatabase;
  /** Called after the store changed (deleted, or already gone) with the notice the list should show. */
  readonly onDeleted: (notice: string) => Promise<void>;
}

type State = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'confirming' }> | Readonly<{ kind: 'deleting' }> | Readonly<{ kind: 'error'; message: string }>;

const entriesAndExits = (count: number): string => count === 1 ? '1 entry or exit' : `${count} entries and exits`;
const fees = (count: number): string => `${count} fee${count === 1 ? '' : 's'}`;

/** P30.2: the confirmed delete of one saved trade through the P30.1 command; the card, the list and the projections are refreshed by the owner that mounted it. */
export function JournalTradeDeleteControl({ entry, db, onDeleted }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const errorRef = useRef<HTMLParagraphElement>(null);
  // A failed delete closes the dialog; the alert in the card then takes focus.
  useEffect(() => { if (state.kind === 'error') errorRef.current?.focus(); }, [state]);
  const { symbol, id } = entry.trade;

  async function confirm(): Promise<void> {
    setState({ kind: 'deleting' });
    const result = await deleteTradeRecord(db, id);
    if (!result.ok && result.type === 'storage-error') { setState({ kind: 'error', message: `Kairos could not delete ${symbol}. Nothing was changed.` }); return; }
    setState({ kind: 'idle' });
    await onDeleted(result.ok
      ? `${symbol} deleted, with its ${entriesAndExits(result.removed.executions)} and ${fees(result.removed.fees)}.`
      : `${symbol} was already gone. The list has been refreshed.`);
  }

  return <div className="kairos-trade-delete" data-trade-delete={state.kind}>
    <button type="button" className="kairos-trade-delete__trigger" onClick={() => setState({ kind: 'confirming' })}>Delete trade</button>
    {state.kind === 'error' ? <p ref={errorRef} tabIndex={-1} role="alert" className="kairos-trade-delete__error">{state.message}</p> : null}
    <ConfirmDialog open={state.kind === 'confirming' || state.kind === 'deleting'} tone="danger" busy={state.kind === 'deleting'}
      title={`Delete ${symbol} for good?`}
      message={`Its ${entriesAndExits(entry.executions.length)} and ${fees(entry.fees.length)} go with it. A backup taken before this keeps it.`}
      confirmLabel="Delete for good" cancelLabel="Keep trade"
      onConfirm={() => { void confirm(); }} onCancel={() => setState({ kind: 'idle' })} />
  </div>;
}
