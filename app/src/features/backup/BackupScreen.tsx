import { type ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BACKUP_REMINDER_EVERY_CHOICES,
  clearBackupFolder,
  commitBackupRestore,
  commitSavedRecordImport,
  commitTradeImport,
  createBrowserBackupDownloadPorts,
  describeBackupFailure,
  describeDaysAgo,
  handBackupFileToBrowser,
  loadBackupFolder,
  loadBackupReminder,
  prepareBackupRestore,
  prepareSavedRecordImport,
  prepareTradeImport,
  runBackup,
  saveBackupFolder,
  saveBackupReminderSetting,
  type BackupDeliver,
  type BackupDeliveryWay,
  type BackupDownloadPorts,
  type BackupReminder,
  type BackupReminderEvery,
  type CommitBackupRestoreResult,
  type CommitSavedRecordImportResult,
  type CommitTradeImportResult,
  type KairosBackupFile,
  type PreparedBackupRestore,
  type PreparedSavedRecordImport,
  type PreparedTradeImport,
  type PrepareBackupRestoreResult,
  type PrepareSavedRecordImportResult,
  type PrepareTradeImportResult,
} from '../../application/backup';
import { loadVisualPnlTimeZone } from '../../application/visual-pnl';
import type { KairosDatabase } from '../../data/database';
import { Button, Card, Field, PageHeader, Select } from '../../design-system/primitives';
import { canChooseBackupFolder, createBrowserBackupDelivery, type BackupFolderHandlePort } from './backupDelivery';
import './backup.css';

export interface BackupScreenProps {
  readonly db: KairosDatabase;
  /** The current instant as a canonical UTC ISO string; tests inject a fixed one. */
  readonly now?: () => string;
  /** The browser download seam; tests inject fakes. */
  readonly downloads?: BackupDownloadPorts;
  /** Where "Back up now" sends the file; built from `downloads` unless a test supplies it. */
  readonly deliver?: BackupDeliver;
  /** Reads a chosen backup file as text; tests inject a reader. */
  readonly readBackupFile?: (file: File) => Promise<string>;
  /** The browser's folder picker (T-054b); left out where the browser cannot keep a folder. */
  readonly pickFolder?: () => Promise<BackupFolderHandlePort>;
}

/** The real browser's folder picker; the id lets the browser start where the last backup folder was. */
const browserFolderPicker = (): Promise<BackupFolderHandlePort> =>
  (window as unknown as { showDirectoryPicker(options: { readonly id: string; readonly mode: 'readwrite' }): Promise<BackupFolderHandlePort> }).showDirectoryPicker({ id: 'kairos-backups', mode: 'readwrite' });

type StatusState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'ready'; reminder: BackupReminder; timeZone: string | null }> | Readonly<{ kind: 'error' }>;
type BackupState = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'busy' }> | Readonly<{ kind: 'done'; file: KairosBackupFile; skippedCount: number; via: BackupDeliveryWay | null; place: string | null }> | Readonly<{ kind: 'error'; message: string }>;
type FolderState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'ready'; name: string | null }> | Readonly<{ kind: 'failed' }>;
type SettingState = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'saved' }> | Readonly<{ kind: 'failed' }>;
type RestoreState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'refused'; message: string }>
  | Readonly<{ kind: 'preview'; fileName: string; restore: PreparedBackupRestore }>
  | Readonly<{ kind: 'committing'; fileName: string; restore: PreparedBackupRestore }>
  | Readonly<{ kind: 'restored'; fileName: string; reloadedTotalRecords: number }>
  | Readonly<{ kind: 'failed'; message: string; recoveryFile: KairosBackupFile }>;
type ImportState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'refused'; message: string }>
  | Readonly<{ kind: 'preview'; fileName: string; import: PreparedTradeImport; records: PreparedSavedRecordImport }>
  | Readonly<{ kind: 'committing'; fileName: string; import: PreparedTradeImport; records: PreparedSavedRecordImport }>
  | Readonly<{ kind: 'done'; fileName: string; added: Extract<CommitTradeImportResult, { ok: true }>['added']; skipped: number; records: Extract<CommitSavedRecordImportResult, { ok: true }>['added']; recordsSkipped: number }>
  | Readonly<{ kind: 'failed'; message: string }>;

/** Stable defaults: a fresh function per render would restart the load effect. */
const wallClock = (): string => new Date().toISOString();
const readFileText = (file: File): Promise<string> => file.text();

const EVERY_LABELS: Readonly<Record<string, string>> = Object.freeze({ '7': 'Every week', '14': 'Every 2 weeks', '30': 'Every month', never: 'Never' });
const everyValue = (every: BackupReminderEvery): string => (every === null ? 'never' : String(every));
const everyFrom = (value: string): BackupReminderEvery => (value === 'never' ? null : (Number(value) as 7 | 14 | 30));

const moment = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
/** "3 Oct 2026, 14:05" in the saved time zone (the phone's when none is saved). */
function localMoment(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone === null ? {} : { timeZone }) }).format(new Date(iso));
  } catch {
    return moment(iso);
  }
}
const kilobytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const plural = (count: number, noun: string, nouns = `${noun}s`): string => `${count} ${count === 1 ? noun : nouns}`;

const prepareFailureText = (result: Exclude<PrepareBackupRestoreResult, { ok: true }>): string => {
  switch (result.type) {
    case 'invalid-input': return 'That file is larger than 64 MB and was not read. Nothing was changed.';
    case 'invalid-backup': return `That file is not a Kairos backup (${result.code}). Nothing was changed.`;
    case 'incompatible-backup': return `That backup cannot be restored on this build (${result.code}). Nothing was changed.`;
    case 'integrity-error': return `Kairos found a problem in your current data (${result.failedChecks.join(', ')}) and did not prepare the restore.`;
    case 'storage-error': return 'Kairos could not prepare the restore. Nothing was changed.';
  }
};
const importPrepareFailureText = (result: Exclude<PrepareTradeImportResult, { ok: true }>): string => {
  switch (result.type) {
    case 'invalid-input': return 'That file is larger than 64 MB and was not read. Nothing was changed.';
    case 'invalid-backup': return `That file is not a Kairos backup (${result.code}). Nothing was changed.`;
    case 'incompatible-backup': return `That backup cannot be imported on this build (${result.code}). Nothing was changed.`;
    case 'identity-conflict': return 'That backup shares a fill, fee or plan id with a different trade on this device, so it cannot be merged. Nothing was changed.';
    case 'storage-error': return 'Kairos could not read your current trades. Nothing was changed.';
  }
};
const importCommitFailureText = (result: Exclude<CommitTradeImportResult, { ok: true }>): string =>
  result.type === 'identity-conflict' ? 'A fill, fee or plan with the same id appeared on this device meanwhile, so nothing was added.' : 'Kairos could not write the imported trades. Nothing was added.';
const recordsPrepareFailureText = (result: Exclude<PrepareSavedRecordImportResult, { ok: true }>): string =>
  result.type === 'storage-error' ? 'Kairos could not read your saved analyses and snapshots. Nothing was changed.' : importPrepareFailureText(result);
const commitFailureText = (result: Exclude<CommitBackupRestoreResult, { ok: true }>): string => {
  switch (result.type) {
    case 'verification-error': return result.code === 'REOPEN_FAILED' ? 'The backup was written but Kairos could not reopen your data to verify it.' : 'The backup was written but the reloaded data did not match it.';
    case 'integrity-error': return `The restored data failed an integrity check (${result.failedChecks.join(', ')}).`;
    case 'storage-error': return 'Kairos could not write the backup to this device.';
  }
};

/**
 * T-054a (D226): "Backup and restore". Back up now (through `runBackup`), how often to be reminded, adding trades from
 * a backup and replacing everything with one (both moved from Profile with their behaviour). When a step's buttons go
 * away, focus goes to that block's heading, never to the page.
 */
export function BackupScreen({ db, now = wallClock, downloads, deliver, readBackupFile = readFileText, pickFolder = canChooseBackupFolder() ? browserFolderPicker : undefined }: BackupScreenProps) {
  const ports = useMemo(() => downloads ?? createBrowserBackupDownloadPorts(window), [downloads]);
  const send = useMemo(() => deliver ?? createBrowserBackupDelivery(db, ports), [db, deliver, ports]);
  const [folder, setFolder] = useState<FolderState>({ kind: 'loading' });
  const folderButton = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<StatusState>({ kind: 'loading' });
  const [backup, setBackup] = useState<BackupState>({ kind: 'idle' });
  const [setting, setSetting] = useState<SettingState>({ kind: 'idle' });
  const [restoreState, setRestoreState] = useState<RestoreState>({ kind: 'idle' });
  const [pickerKey, setPickerKey] = useState(0);
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' });
  const [importPickerKey, setImportPickerKey] = useState(0);
  const [revision, setRevision] = useState(0);
  const importHeading = useRef<HTMLHeadingElement>(null);
  const restoreHeading = useRef<HTMLHeadingElement>(null);
  const importAdd = useRef<HTMLButtonElement>(null);
  const restoreFirst = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([loadBackupReminder(db, { now }), loadVisualPnlTimeZone(db)]).then(
      ([reminder, timeZone]) => { if (!ignore) setStatus({ kind: 'ready', reminder, timeZone }); },
      () => { if (!ignore) setStatus({ kind: 'error' }); },
    );
    return () => { ignore = true; };
  }, [db, now, revision]);

  useEffect(() => {
    if (pickFolder === undefined) return;
    let ignore = false;
    loadBackupFolder(db).then(saved => { if (!ignore) setFolder({ kind: 'ready', name: saved?.name ?? null }); }, () => { if (!ignore) setFolder({ kind: 'ready', name: null }); });
    return () => { ignore = true; };
  }, [db, pickFolder]);

  // A chosen file's preview takes the focus from the file field, which is disabled while it shows.
  const importPreviewShown = importState.kind === 'preview';
  const restorePreviewShown = restoreState.kind === 'preview';
  // In the commit that shows the preview, so focus never sits on the disabled field for a moment.
  useLayoutEffect(() => { if (importPreviewShown) importAdd.current?.focus(); }, [importPreviewShown]);
  useLayoutEffect(() => { if (restorePreviewShown) restoreFirst.current?.focus(); }, [restorePreviewShown]);

  const download = (file: KairosBackupFile): boolean => {
    try { handBackupFileToBrowser(file, ports); return true; } catch { return false; }
  };

  async function handleBackup(): Promise<void> {
    if (backup.kind === 'busy' || restoreBusy) return;
    setBackup({ kind: 'busy' });
    const result = await runBackup(db, send, { now });
    if (!result.ok) {
      const message = describeBackupFailure(result);
      setBackup(message === null ? { kind: 'idle' } : { kind: 'error', message });
      return;
    }
    setBackup({ kind: 'done', file: result.file, skippedCount: result.skippedCount, via: result.via, place: result.place });
    setRevision(value => value + 1);
  }

  async function chooseFolder(): Promise<void> {
    if (pickFolder === undefined) return;
    let picked: BackupFolderHandlePort;
    try { picked = await pickFolder(); } catch { return; } // The trader closed the picker.
    const saved = await saveBackupFolder(db, { name: picked.name, handle: picked }, { now });
    setFolder(saved.ok ? { kind: 'ready', name: picked.name } : { kind: 'failed' });
    folderButton.current?.focus();
  }

  async function stopFolder(): Promise<void> {
    const cleared = await clearBackupFolder(db);
    setFolder(cleared.ok ? { kind: 'ready', name: null } : { kind: 'failed' });
    folderButton.current?.focus();
  }

  async function handleSetting(value: string): Promise<void> {
    const result = await saveBackupReminderSetting(db, everyFrom(value), { now });
    setSetting(result.ok ? { kind: 'saved' } : { kind: 'failed' });
    if (result.ok) setRevision(current => current + 1);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file || restoreBusy) return;
    setRestoreState({ kind: 'reading' });
    let text: string;
    try { text = await readBackupFile(file); } catch { setRestoreState({ kind: 'refused', message: 'That file could not be read. Nothing was changed.' }); return; }
    const result = await prepareBackupRestore(db, text);
    setRestoreState(result.ok ? { kind: 'preview', fileName: file.name, restore: result.restore } : { kind: 'refused', message: prepareFailureText(result) });
  }

  function cancelRestore(): void { setRestoreState({ kind: 'idle' }); setPickerKey(value => value + 1); restoreHeading.current?.focus(); }

  async function handleCommit(): Promise<void> {
    if (restoreState.kind !== 'preview') return;
    const { fileName, restore } = restoreState;
    setRestoreState({ kind: 'committing', fileName, restore });
    const result = await commitBackupRestore(db, restore);
    setPickerKey(value => value + 1);
    if (!result.ok) { setRestoreState({ kind: 'failed', message: commitFailureText(result), recoveryFile: result.recoveryFile }); restoreHeading.current?.focus(); return; }
    setRestoreState({ kind: 'restored', fileName, reloadedTotalRecords: result.restored.reloadedTotalRecords });
    setBackup({ kind: 'idle' });
    setRevision(value => value + 1);
    restoreHeading.current?.focus();
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file || importBusy) return;
    setImportState({ kind: 'reading' });
    let text: string;
    try { text = await readBackupFile(file); } catch { setImportState({ kind: 'refused', message: 'That file could not be read. Nothing was changed.' }); return; }
    const result = await prepareTradeImport(db, text);
    if (!result.ok) { setImportState({ kind: 'refused', message: importPrepareFailureText(result) }); return; }
    const records = await prepareSavedRecordImport(db, text);
    if (!records.ok) { setImportState({ kind: 'refused', message: recordsPrepareFailureText(records) }); return; }
    setImportState({ kind: 'preview', fileName: file.name, import: result.import, records: records.import });
  }

  function cancelImport(): void { setImportState({ kind: 'idle' }); setImportPickerKey(value => value + 1); importHeading.current?.focus(); }

  async function handleImportCommit(): Promise<void> {
    if (importState.kind !== 'preview') return;
    const { fileName, import: prepared, records } = importState;
    setImportState({ kind: 'committing', fileName, import: prepared, records });
    const result = await commitTradeImport(db, prepared);
    if (!result.ok) { setImportPickerKey(value => value + 1); setImportState({ kind: 'failed', message: importCommitFailureText(result) }); importHeading.current?.focus(); return; }
    const recordsResult = await commitSavedRecordImport(db, records);
    setImportPickerKey(value => value + 1);
    importHeading.current?.focus();
    if (!recordsResult.ok) { setImportState({ kind: 'failed', message: `Added ${plural(result.added.trades, 'trade')}, but Kairos could not write the saved analyses and snapshots. Choose the file again to add them.` }); return; }
    setImportState({ kind: 'done', fileName, added: result.added, skipped: result.skipped, records: recordsResult.added, recordsSkipped: recordsResult.skipped });
    setBackup({ kind: 'idle' });
    setRevision(value => value + 1);
  }

  const restoreBusy = restoreState.kind === 'reading' || restoreState.kind === 'committing';
  const importBusy = importState.kind === 'reading' || importState.kind === 'committing';
  const importPreview = importState.kind === 'preview' || importState.kind === 'committing' ? importState.import.preview : null;
  const recordsPreview = importState.kind === 'preview' || importState.kind === 'committing' ? importState.records.preview : null;
  const importNew = importPreview && recordsPreview ? importPreview.newTrades + importPreview.newPracticeTrades + recordsPreview.newAnalyses + recordsPreview.newSnapshots : 0;
  const preview = restoreState.kind === 'preview' || restoreState.kind === 'committing' ? restoreState.restore.preview : null;
  const reminder = status.kind === 'ready' ? status.reminder : null;

  return <section className="kairos-route kairos-backup" aria-labelledby="kairos-backup-title" data-backup-export={backup.kind} data-backup-restore={restoreState.kind} data-backup-import={importState.kind}>
    <PageHeader title="Backup and restore" titleId="kairos-backup-title" intro="Save a copy of your journal somewhere safe, or bring one back." />

    <Card as="article" className="kairos-backup-card" aria-labelledby="kairos-backup-last-title">
      <h2 id="kairos-backup-last-title">Your last backup</h2>
      <p data-backup-last={status.kind === 'loading' ? 'loading' : reminder?.lastBackupAt ? 'recorded' : status.kind === 'error' ? 'error' : 'never'}>
        {status.kind === 'loading' ? 'Reading when this device was last backed up…'
          : status.kind === 'error' ? 'Kairos could not read when this device was last backed up.'
            : reminder!.lastBackupAt === null ? 'No backup yet on this device.'
              : `Last backup ${describeDaysAgo(reminder!.calendarDaysSince ?? 0)} · ${localMoment(reminder!.lastBackupAt, status.timeZone)}`}
      </p>
      <p>Saves one file with your journal, saved analyses, saved snapshots and preferences. Your data is not changed.</p>
      <div className="kairos-backup-card__actions">
        <Button emphasis="main" onClick={() => { void handleBackup(); }} aria-disabled={backup.kind === 'busy' || restoreBusy || undefined}>{backup.kind === 'busy' ? 'Saving…' : 'Back up now'}</Button>
      </div>
      {backup.kind === 'done' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--success" role="status">Backup saved: <code>{backup.file.fileName}</code> · {plural(backup.file.recordCounts.total, 'record')} · {kilobytes(backup.file.byteLength)}.</p> : null}
      {backup.kind === 'done' && backup.via !== null ? <p className="kairos-backup__note" data-backup-via={backup.via}>{backup.via === 'folder' ? `Saved to ${backup.place ?? 'your backup folder'}.` : backup.via === 'share' ? "Shared. Kairos can't see where you shared it; keep it somewhere you can find." : 'Downloaded.'}</p> : null}
      {backup.kind === 'done' && backup.skippedCount > 0 ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--error" role="status">Backup saved. {plural(backup.skippedCount, 'saved item')} {backup.skippedCount === 1 ? 'was' : 'were'} damaged and left out; {backup.skippedCount === 1 ? 'it is' : 'they are'} still on this device.</p> : null}
      {backup.kind === 'error' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--error" role="alert">{backup.message}</p> : null}
    </Card>

    {pickFolder !== undefined ? <Card as="article" className="kairos-backup-card" aria-labelledby="kairos-backup-folder-title" data-backup-folder={folder.kind === 'ready' ? (folder.name === null ? 'none' : 'chosen') : folder.kind}>
      <h2 id="kairos-backup-folder-title">Backup folder</h2>
      {folder.kind === 'ready' && folder.name !== null
        ? <p>Backups go to: <strong>{folder.name}</strong></p>
        : <p>Choose a folder on this computer, and "Back up now" saves each backup there.</p>}
      <div className="kairos-backup-card__actions">
        <Button ref={folderButton} variant="secondary" onClick={() => { void chooseFolder(); }}>{folder.kind === 'ready' && folder.name !== null ? 'Change' : 'Choose a backup folder'}</Button>
        {folder.kind === 'ready' && folder.name !== null ? <Button variant="ghost" onClick={() => { void stopFolder(); }}>Stop using this folder</Button> : null}
      </div>
      {folder.kind === 'failed' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--error" role="alert">Kairos could not save this. Nothing was changed.</p> : null}
    </Card> : null}

    <Card as="article" className="kairos-backup-card" aria-labelledby="kairos-backup-remind-title">
      <h2 id="kairos-backup-remind-title">Remind me</h2>
      <p>Home and the Journal remind you when a backup is due, and after 20 new trades.</p>
      {reminder !== null ? <Field label="How often" id="kairos-backup-every">
        {control => <Select {...control} value={everyValue(reminder.every)} onChange={event => { void handleSetting(event.target.value); }}
          options={BACKUP_REMINDER_EVERY_CHOICES.map(every => ({ value: everyValue(every), label: EVERY_LABELS[everyValue(every)]! }))} />}
      </Field> : null}
      {setting.kind === 'saved' ? <p className="kairos-backup__note" role="status">Saved.</p> : null}
      {setting.kind === 'failed' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--error" role="alert">Kairos could not save this. Nothing was changed.</p> : null}
    </Card>

    <Card as="article" className="kairos-backup-card" aria-labelledby="kairos-backup-import-title">
      <h2 id="kairos-backup-import-title" tabIndex={-1} ref={importHeading}>Add trades from a backup</h2>
      <p>Add the trades, saved analyses and saved snapshots from another Kairos backup that this device does not have yet. Records already here are left exactly as they are.</p>
      <label className="kairos-backup-field" htmlFor="kairos-backup-import-file"><span>Backup file to import from</span><input key={importPickerKey} id="kairos-backup-import-file" type="file" accept="application/json,.json" onChange={event => { void handleImportFile(event); }} disabled={importState.kind === 'preview' || importState.kind === 'committing'} /></label>
      {importState.kind === 'reading' ? <p className="kairos-backup__note" role="status">Reading the backup…</p> : null}
      {importState.kind === 'refused' || importState.kind === 'failed' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--error" role="alert">{importState.message}</p> : null}
      {importPreview && recordsPreview && (importState.kind === 'preview' || importState.kind === 'committing') ? <div className="kairos-backup-preview" data-backup-import-new={importNew}>
        <p><strong>{importState.fileName}</strong> was exported {moment(importPreview.exportedAt)}. It holds {plural(importPreview.newTrades, 'trade')} and {plural(importPreview.newPracticeTrades, 'practice trade')} this device does not have, with {plural(importPreview.executions, 'fill')}, {plural(importPreview.fees, 'fee')} and {plural(importPreview.plans, 'plan')}; {plural(importPreview.alreadyPresent, 'trade')} already here will be left as they are.</p>
        <p data-backup-import-records={recordsPreview.newAnalyses + recordsPreview.newSnapshots}>It also holds {plural(recordsPreview.newAnalyses, 'saved analysis', 'saved analyses')} and {plural(recordsPreview.newSnapshots, 'saved snapshot')} this device does not have; {plural(recordsPreview.analysesPresent + recordsPreview.snapshotsPresent, 'saved record')} already here will be left as they are.</p>
        <div className="kairos-backup-card__actions">
          <Button ref={importAdd} onClick={() => { if (!importBusy && importNew > 0) void handleImportCommit(); }} aria-disabled={importBusy || importNew === 0 || undefined}>{importState.kind === 'committing' ? 'Adding…' : 'Add these records'}</Button>
          <Button variant="secondary" onClick={() => { if (!importBusy) cancelImport(); }} aria-disabled={importBusy || undefined}>Cancel</Button>
        </div>
      </div> : null}
      {importState.kind === 'done' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--success" role="status">Added {plural(importState.added.trades, 'trade')} from <code>{importState.fileName}</code> with {plural(importState.added.executions, 'fill')}, {plural(importState.added.fees, 'fee')} and {plural(importState.added.plans, 'plan')}, plus {plural(importState.records.analyses, 'saved analysis', 'saved analyses')} and {plural(importState.records.snapshots, 'saved snapshot')}{importState.skipped + importState.recordsSkipped > 0 ? `; ${plural(importState.skipped + importState.recordsSkipped, 'record')} appeared meanwhile and ${importState.skipped + importState.recordsSkipped === 1 ? 'was' : 'were'} left alone` : ''}. Imported trades show their source as Import.</p> : null}
    </Card>

    <Card as="article" className="kairos-backup-card" aria-labelledby="kairos-backup-restore-title">
      <h2 id="kairos-backup-restore-title" tabIndex={-1} ref={restoreHeading}>Replace everything with a backup</h2>
      <p>Choose a Kairos backup file. You will see what it holds before anything is replaced.</p>
      <label className="kairos-backup-field" htmlFor="kairos-backup-backup-file"><span>Backup file</span><input key={pickerKey} id="kairos-backup-backup-file" type="file" accept="application/json,.json" onChange={event => { void handleFile(event); }} disabled={restoreState.kind === 'preview' || restoreState.kind === 'committing'} /></label>
      {restoreState.kind === 'reading' ? <p className="kairos-backup__note" role="status">Reading the backup…</p> : null}
      {restoreState.kind === 'refused' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--error" role="alert">{restoreState.message}</p> : null}
      {preview && (restoreState.kind === 'preview' || restoreState.kind === 'committing') ? <div className="kairos-backup-preview" data-backup-preview-records={preview.totalRecords}>
        <p><strong>{restoreState.fileName}</strong> was exported {moment(preview.exportedAt)} and holds {plural(preview.totalRecords, 'record')}: {plural(preview.tradeRecords, 'trade')}, {plural(preview.savedAnalysisRecords, 'saved analysis', 'saved analyses')}, {plural(preview.savedTimeAssistedSnapshotRecords, 'saved snapshot')}, {plural(preview.metadataRecords, 'preference')}.</p>
        <p className="kairos-backup-preview__warning" role="status">Restoring replaces everything on this device with this backup. Your current data is offered as a download first.</p>
        {restoreState.restore.recoveryKind === 'raw' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--error" role="alert">Your current data has a problem. Download the raw copy first; it may not restore.</p> : null}
        <div className="kairos-backup-card__actions">
          <Button ref={restoreFirst} variant="secondary" onClick={() => { if (!restoreBusy) download(restoreState.restore.recoveryFile); }} aria-disabled={restoreBusy || undefined}>Download current data first</Button>
          <Button variant="danger" onClick={() => { if (!restoreBusy) void handleCommit(); }} aria-disabled={restoreBusy || undefined}>{restoreState.kind === 'committing' ? 'Restoring…' : 'Replace my data'}</Button>
          <Button variant="secondary" onClick={() => { if (!restoreBusy) cancelRestore(); }} aria-disabled={restoreBusy || undefined}>Cancel</Button>
        </div>
      </div> : null}
      {restoreState.kind === 'restored' ? <p className="kairos-backup-card__feedback kairos-backup-card__feedback--success" role="status">Restored {plural(restoreState.reloadedTotalRecords, 'record')} from <code>{restoreState.fileName}</code> and verified them after reopening. Other pages show the restored data when you open them.</p> : null}
      {restoreState.kind === 'failed' ? <div className="kairos-backup-card__feedback kairos-backup-card__feedback--error"><p role="alert">{restoreState.message} Your data from before the restore is available as a download.</p><div className="kairos-backup-card__actions"><Button variant="secondary" onClick={() => { download(restoreState.recoveryFile); }}>Download the pre-restore copy</Button></div></div> : null}
    </Card>
  </section>;
}
