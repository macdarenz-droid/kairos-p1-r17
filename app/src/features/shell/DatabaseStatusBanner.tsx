import { useEffect, useRef, useState } from 'react';
import { describeBackupFailure, type RunBackupResult } from '../../application/backup';
import { Button } from '../../design-system/primitives';

/** What the banner hears and does; the app passes the database's own (features never import the data layer's state). */
export interface DatabaseStatusPort {
  /** The database's lifecycle (`subscribeDatabaseLifecycle`); called at once with the current state. */
  readonly subscribe: (listener: (status: { readonly state: string }) => void) => () => void;
  /** Opens the database again ("Try again"), answering the state it reached. */
  readonly reopen: () => Promise<{ readonly state: string }>;
  /** Each failed write's kind, and null once a write commits after a failure. */
  readonly subscribeWriteFailures: (listener: (kind: 'storage-full' | 'closed' | 'other' | null) => void) => () => void;
  /** A backup handed over as a download only ("Download what can be read"). */
  readonly downloadReadable: () => Promise<RunBackupResult>;
  readonly reload: () => void;
}

type Note = 'version-change' | 'upgrade-blocked' | 'closed' | 'storage-full';
type Download = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'busy' }> | Readonly<{ kind: 'done'; message: string }>;

const plural = (count: number, noun: string): string => `${count} ${count === 1 ? noun : `${noun}s`}`;

/** The words after "Download what can be read". */
function describeDownload(result: RunBackupResult): string {
  if (!result.ok) return describeBackupFailure(result) ?? 'Nothing was downloaded.';
  if (result.skippedCount === 0) return 'Downloaded.';
  return `Downloaded. ${plural(result.skippedCount, 'saved item')} could not be read and ${result.skippedCount === 1 ? 'was' : 'were'} left out; ${result.skippedCount === 1 ? 'it is' : 'they are'} still on this device.`;
}

/**
 * T-054d (D229): the shell shows the database's own state, so a save never fails silently: another tab updated Kairos,
 * an update waits for other tabs, the link to the journal was lost, or the phone is full. Nothing shows while the
 * database is ready. When the note goes while focus was in it, the host moves focus on (`onGone`).
 */
export function DatabaseStatusBanner({ port, onGone }: { readonly port: DatabaseStatusPort; readonly onGone?: () => void }) {
  const [lifecycle, setLifecycle] = useState<Note | null>(null);
  const [write, setWrite] = useState<'storage-full' | 'closed' | null>(null);
  const [trying, setTrying] = useState(false);
  const [still, setStill] = useState(false);
  const [download, setDownload] = useState<Download>({ kind: 'idle' });
  // Saving works again (a write committed after the failure) while the trader's download keeps the note open.
  const [recovered, setRecovered] = useState(false);
  const downloading = useRef(false);
  const hadFocus = useRef(false);
  // "Lost its link" needs a link first: an open that never worked also reports "closed" (Dexie closes after it).
  const wasReady = useRef(false);

  // "Updated in another tab" stays until the trader reloads: this tab's code is older than the journal now, even when
  // a screen opens the journal again (T-054d fix r1).
  const keep = (next: Note | null) => setLifecycle(current => (current === 'version-change' ? current : next));
  useEffect(() => port.subscribe(status => {
    if (status.state === 'ready') {
      wasReady.current = true;
      keep(null);
      setStill(false);
      // The link is back: a closed-database failure is over.
      setWrite(current => (current === 'closed' ? null : current));
    } else if (status.state === 'version-change') {
      setLifecycle('version-change');
    } else if (status.state === 'upgrade-blocked' || (status.state === 'closed' && wasReady.current)) {
      keep(status.state);
    } else if (status.state === 'opening') {
      // Opening keeps "Try again" under the finger; a "lost its link" was a planned close (a restore reopens the journal).
      setLifecycle(current => (current === 'upgrade-blocked' || current === 'version-change' ? current : null));
    }
    // An open that failed keeps the note shown.
  }), [port]);
  useEffect(() => port.subscribeWriteFailures(kind => {
    if (kind === 'storage-full' || kind === 'closed') { setWrite(kind); setDownload({ kind: 'idle' }); setRecovered(false); downloading.current = false; }
    // The failure is over; a download the trader started keeps the note until they close it, so its result stays readable.
    else if (kind === null) { if (downloading.current) setRecovered(true); else setWrite(null); }
  }), [port]);

  const note: Note | null = lifecycle ?? write;
  useEffect(() => {
    if (note !== null || !hadFocus.current) return;
    hadFocus.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body) onGone?.();
  }, [note, onGone]);

  async function tryAgain(): Promise<void> {
    if (trying) return;
    setTrying(true);
    const status = await port.reopen().catch(() => ({ state: 'error' }));
    setTrying(false);
    if (status.state !== 'ready') setStill(true);
  }

  async function downloadReadable(): Promise<void> {
    if (download.kind === 'busy') return;
    setDownload({ kind: 'busy' });
    downloading.current = true;
    const result = await port.downloadReadable().catch((): RunBackupResult => ({ ok: false, reason: 'delivery-failed' }));
    setDownload({ kind: 'done', message: describeDownload(result) });
  }

  if (note === null) return null;
  return <div className="kairos-database-status" role="alert" data-database-note={note}
    onFocus={() => { hadFocus.current = true; }}
    onBlur={event => { if (event.relatedTarget !== null && !event.currentTarget.contains(event.relatedTarget as Node)) hadFocus.current = false; }}>
    {note === 'version-change' ? <>
      <p>Kairos was updated in another tab. Reload to keep saving.</p>
      <Button size="sm" onClick={port.reload}>Reload</Button>
    </> : null}
    {note === 'upgrade-blocked' ? <>
      <p>{still ? "Kairos still can't open your journal. Close other Kairos tabs, then Try again." : 'Close other Kairos tabs, then Try again.'}</p>
      <Button size="sm" onClick={() => { void tryAgain(); }} aria-disabled={trying || undefined}>{trying ? 'Trying…' : 'Try again'}</Button>
    </> : null}
    {note === 'closed' ? <>
      <p>Kairos lost its link to your journal. Reload to keep saving.</p>
      <Button size="sm" onClick={port.reload}>Reload</Button>
    </> : null}
    {note === 'storage-full' ? <>
      <p>Your phone's storage is full, so Kairos could not save. Free some space, then try again.</p>
      <Button size="sm" variant="secondary" onClick={() => { void downloadReadable(); }} aria-disabled={download.kind === 'busy' || undefined}>{download.kind === 'busy' ? 'Downloading…' : 'Download what can be read'}</Button>
      {download.kind === 'done' ? <>
        <p className="kairos-database-status__result">{download.message}{recovered ? ' Kairos can save again.' : ''}</p>
        <Button size="sm" variant="ghost" onClick={() => { downloading.current = false; setDownload({ kind: 'idle' }); setRecovered(false); setWrite(null); }}>Close</Button>
      </> : null}
    </> : null}
  </div>;
}
