import { useEffect, useId, useRef, useState } from 'react';
import { loadJournalCsv, writeJournalFilters, type JournalCsvFile, type JournalFilters, type JournalHistoryScope } from '../../application/journal';
import type { KairosDatabase } from '../../data/database';
import { Button } from '../../design-system/primitives';
import { browserFileDeliveryPorts, deliverFile, type FileDeliveryPorts } from './fileDelivery';
import './journalCsvButton.css';

type State =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'building' }>
  | Readonly<{ kind: 'saved'; fileName: string }>
  /** `made`: the file was made but could not be handed over; "Try again" hands the same file over at once. */
  | Readonly<{ kind: 'failed'; made: JournalCsvFile | null }>;

const wallClock = (): string => new Date().toISOString();

/**
 * U15 (D266): "Download as a spreadsheet" under the Journal's or Practice's list: every trade matching the filters, not
 * only the rows on screen, as a CSV handed to the share sheet, else downloaded. It stays focusable while it builds; it
 * then says "Saved kairos-journal-2026-10-24.csv.", or why it failed with "Try again" (which takes focus). With no
 * trade to put in it, it says "Nothing to download" and why.
 */
export function JournalCsvButton({ db, scope, filters, timeZone, empty, filtered, ports, now = wallClock }: {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  readonly filters: JournalFilters;
  /** The trader's time zone (undefined while it is read: the device's is used). */
  readonly timeZone: string | undefined;
  /** The list has no trade (or none matching). */
  readonly empty: boolean;
  readonly filtered: boolean;
  readonly ports?: FileDeliveryPorts;
  readonly now?: () => string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const building = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  useEffect(() => { if (state.kind === 'failed') retry.current?.focus(); }, [state.kind]);
  // Another list is another spreadsheet: what was said about the last one goes.
  const listKey = `${scope}?${writeJournalFilters(filters).toString()}`;
  useEffect(() => { setState({ kind: 'idle' }); }, [listKey]);

  async function download(made: JournalCsvFile | null = null): Promise<void> {
    if (building.current || empty) return;
    building.current = true;
    setState({ kind: 'building' });
    let file = made;
    try {
      file ??= await loadJournalCsv(db, { scope, filters, timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, now: now() });
      const result = await deliverFile(new Blob([file.text], { type: 'text/csv;charset=utf-8' }), file.fileName, 'text/csv', ports ?? browserFileDeliveryPorts());
      // Closing the share sheet is the trader's choice: nothing to say.
      setState(result === 'failed' ? { kind: 'failed', made: file } : result === 'cancelled' ? { kind: 'idle' } : { kind: 'saved', fileName: file.fileName });
    } catch {
      setState({ kind: 'failed', made: file });
    } finally {
      building.current = false;
    }
  }

  if (empty) return <div className="kairos-history__csv">
    <Button variant="secondary" size="sm" disabled aria-describedby={reasonId}>Nothing to download</Button>
    <p id={reasonId} className="kairos-history__csv-note">{filtered ? 'None of your trades match these filters.' : 'There are no trades here yet.'}</p>
  </div>;

  return <div className="kairos-history__csv">
    {/* Busy, not disabled, while it builds: a disabled button would drop focus to the page. */}
    <Button ref={button} variant="secondary" size="sm" aria-disabled={state.kind === 'building' || undefined} aria-busy={state.kind === 'building' || undefined}
      onClick={() => { void download(); }}>
      {state.kind === 'building' ? 'Making the spreadsheet…' : 'Download as a spreadsheet'}
    </Button>
    {/* Always there, even empty, so its words are read out when they change (a live region, not a second "status"). */}
    <p className="kairos-history__csv-note" aria-live="polite">{state.kind === 'saved' ? `Saved ${state.fileName}.` : ''}</p>
    {state.kind === 'failed' ? <p className="kairos-history__csv-note kairos-history__csv-error" role="alert">
      {state.made === null ? 'Kairos could not make the spreadsheet.' : `Kairos made ${state.made.fileName} but could not save it.`} Your trades were not changed.{' '}
      <Button ref={retry} variant="ghost" size="sm" onClick={() => { const made = state.made; button.current?.focus(); void download(made); }}>Try again</Button>
    </p> : null}
  </div>;
}
