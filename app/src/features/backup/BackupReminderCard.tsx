import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  describeBackupFailure,
  describeBackupReminder,
  loadBackupReminder,
  remindBackupLater,
  runBackup,
  type BackupDeliver,
  type BackupDownloadPorts,
  type BackupReminder,
} from '../../application/backup';
import type { KairosDatabase } from '../../data/database';
import { Icon } from '../../design-system/icons/Icon';
import { Button, Card } from '../../design-system/primitives';
import { createBrowserBackupDelivery } from './backupDelivery';
import './backup.css';

type CardState =
  | Readonly<{ kind: 'shown'; reminder: BackupReminder }>
  | Readonly<{ kind: 'busy'; reminder: BackupReminder }>
  | Readonly<{ kind: 'failed'; reminder: BackupReminder; message: string }>
  | Readonly<{ kind: 'later-failed'; reminder: BackupReminder }>
  | Readonly<{ kind: 'saved' }>
  | Readonly<{ kind: 'gone' }>;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The first control after `element` on the page (outside it), for when the element's own buttons go away. */
function nextControlAfter(element: HTMLElement | null): HTMLElement | null {
  if (element === null) return null;
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .find(candidate => !element.contains(candidate) && (element.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) ?? null;
}

const wallClock = (): string => new Date().toISOString();

/**
 * T-054a (D226): on Home and the Journal while a backup is due. "Back up now" runs the backup right here; "Later" holds
 * the reminder for a day. When its buttons go away, focus moves to the next control on the page.
 */
export function BackupReminderCard({ db, now = wallClock, downloads, deliver }: {
  readonly db: KairosDatabase;
  readonly now?: () => string;
  readonly downloads?: BackupDownloadPorts;
  readonly deliver?: BackupDeliver;
}) {
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);
  const send = useMemo(() => deliver ?? createBrowserBackupDelivery(db, downloads), [db, deliver, downloads]);
  const [state, setState] = useState<CardState>({ kind: 'gone' });
  const [moveFocus, setMoveFocus] = useState(0);
  const next = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let ignore = false;
    loadBackupReminder(db, { now }).then(reminder => { if (!ignore && reminder.due) setState({ kind: 'shown', reminder }); }, () => undefined);
    return () => { ignore = true; };
  }, [db, now]);

  // Found while the card is there, focused after the commit that removes its buttons; only when focus was still in the
  // card (or fell to the page), never when the trader moved on during the save.
  useEffect(() => {
    if (moveFocus === 0 || next.current === null) return;
    const active = document.activeElement;
    if (active === null || active === document.body || card.current?.contains(active)) next.current.focus();
  }, [moveFocus]);
  const leave = () => { next.current = nextControlAfter(card.current); setMoveFocus(value => value + 1); };

  async function backUp(reminder: BackupReminder): Promise<void> {
    setState({ kind: 'busy', reminder });
    const result = await runBackup(db, send, { now });
    if (result.ok) { setState({ kind: 'saved' }); leave(); return; }
    const message = describeBackupFailure(result);
    setState(message === null ? { kind: 'shown', reminder } : { kind: 'failed', reminder, message });
  }

  async function later(reminder: BackupReminder): Promise<void> {
    const result = await remindBackupLater(db, { now });
    if (!result.ok) { setState({ kind: 'later-failed', reminder }); return; }
    leave();
    setState({ kind: 'gone' });
  }

  if (state.kind === 'gone') return null;
  const heading = <div className="kairos-backup-reminder__heading">
    <Icon name="backup" size={24} className="kairos-backup-reminder__icon" />
    <h2 id={titleId}>Back up your journal</h2>
  </div>;
  if (state.kind === 'saved') return <div ref={card}><Card as="section" className="kairos-backup-reminder" aria-labelledby={titleId}>
    {heading}
    <p role="status">Backup saved.</p>
  </Card></div>;
  const { reminder } = state;
  const busy = state.kind === 'busy';
  return <div ref={card}><Card as="section" className="kairos-backup-reminder" aria-labelledby={titleId}>
    {heading}
    <p>{describeBackupReminder(reminder)}</p>
    {state.kind === 'failed' ? <p role="alert" className="kairos-backup-reminder__problem">{state.message}</p> : null}
    {state.kind === 'later-failed' ? <p role="alert" className="kairos-backup-reminder__problem">Kairos could not save "Later". Nothing was changed; press it again to try once more.</p> : null}
    <div className="kairos-backup-reminder__actions">
      {/* One button whose words change, so a retry keeps the focus. */}
      <Button onClick={() => { if (!busy) void backUp(reminder); }} aria-disabled={busy || undefined}>{busy ? 'Saving…' : state.kind === 'failed' ? 'Try again' : 'Back up now'}</Button>
      <Button variant="ghost" onClick={() => { if (!busy) void later(reminder); }} aria-disabled={busy || undefined}>Later</Button>
    </div>
  </Card></div>;
}
