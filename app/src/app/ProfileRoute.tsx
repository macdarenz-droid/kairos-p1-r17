import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  commitBackupRestore,
  commitSavedRecordImport,
  commitTradeImport,
  createBrowserBackupDownloadPorts,
  exportKairosBackup,
  handBackupFileToBrowser,
  prepareBackupRestore,
  prepareSavedRecordImport,
  prepareTradeImport,
  readLastBackup,
  recordLastBackup,
  type BackupDownloadPorts,
  type CommitBackupRestoreResult,
  type CommitSavedRecordImportResult,
  type CommitTradeImportResult,
  type KairosBackupFile,
  type LastBackupRecord,
  type PreparedBackupRestore,
  type PreparedSavedRecordImport,
  type PreparedTradeImport,
  type PrepareBackupRestoreResult,
  type PrepareSavedRecordImportResult,
  type PrepareTradeImportResult,
} from '../application/backup';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import { inspectStorageDurability, requestPersistentStorage, subscribeStorageDurabilityStatus, type StorageDurabilityStatus } from '../pwa/storageDurability';
import { ActivationReceiptRepository, type StoredActivationReceiptLoadResult } from '../services/activation';
import { buildInfo } from '../shared/config/buildInfo';
import './profileRoute.css';

interface ProfileRouteProps {
  readonly db?: KairosDatabase;
  /** The current instant as a canonical UTC ISO string; tests inject a fixed one. */
  readonly now?: () => string;
  /** The browser download seam; tests inject fakes. */
  readonly downloads?: BackupDownloadPorts;
  /** Reads a chosen backup file as text; tests inject a reader. */
  readonly readBackupFile?: (file: File) => Promise<string>;
  /** The released storage-durability owner; tests inject fakes. */
  readonly durability?: StorageDurabilityPorts;
}

export interface StorageDurabilityPorts {
  readonly inspect: () => Promise<StorageDurabilityStatus>;
  readonly request: () => Promise<StorageDurabilityStatus>;
  readonly subscribe: (listener: (status: StorageDurabilityStatus) => void) => () => void;
}

/** A stable default: the released owner's functions, never recreated per render. */
const releasedDurability: StorageDurabilityPorts = Object.freeze({ inspect: inspectStorageDurability, request: requestPersistentStorage, subscribe: subscribeStorageDurabilityStatus });
type LastBackupState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'ready'; record: LastBackupRecord | null }>;
type PersistState = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'requesting' }> | Readonly<{ kind: 'declined' }>;

type ActivationState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error' }> | Readonly<{ kind: 'ready'; stored: StoredActivationReceiptLoadResult }>;
type ExportState = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'busy' }> | Readonly<{ kind: 'done'; file: KairosBackupFile; skippedCount: number }> | Readonly<{ kind: 'error'; message: string }>;
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

const moment = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
const durabilityText = (status: StorageDurabilityStatus): string => {
  switch (status.state) {
    case 'persistent': return 'This browser has promised to keep Kairos data on this device unless you clear it yourself.';
    case 'best-effort': return 'This browser may clear Kairos data when storage runs low. Ask it to keep your data, and keep a backup.';
    case 'unsupported': return 'This browser cannot promise to keep data on this device. Keep a recent backup.';
    case 'error': return 'Kairos could not check whether this browser keeps data. Keep a recent backup.';
    case 'unknown': return 'Checking whether this browser keeps your data…';
  }
};
const kilobytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const plural = (count: number, noun: string, nouns = `${noun}s`): string => `${count} ${count === 1 ? noun : nouns}`;

const exportFailureText = (result: Exclude<Awaited<ReturnType<typeof exportKairosBackup>>, { ok: true }>): string => {
  switch (result.type) {
    case 'integrity-error': return `Kairos found a problem in your stored data (${result.failedChecks.join(', ')}) and did not export it.`;
    case 'storage-error': return 'Kairos could not read your data. Nothing was downloaded.';
    case 'invalid-input': return 'The current time could not be read. Nothing was downloaded.';
  }
};
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

function Activation({ state }: { readonly state: ActivationState }) {
  if (state.kind === 'loading') return <p data-profile-activation="loading">Reading this device's activation…</p>;
  if (state.kind === 'error') return <p role="alert" data-profile-activation="error">The activation receipt could not be read.</p>;
  const { stored } = state;
  if (stored.status === 'missing') return <p data-profile-activation="missing">No activation receipt is stored on this device.</p>;
  if (stored.status === 'corrupt') return <p role="alert" data-profile-activation="corrupt">The stored activation receipt is unreadable.</p>;
  return <p data-profile-activation="stored">Activated · activation <code>{stored.receipt.activationId}</code> · issued {moment(stored.receipt.issuedAt)} · stored on this device {moment(stored.storedAt)}</p>;
}

/** Profile: this device's data. Export through P28.1, restore through P28.2, activation read-only; nothing here estimates or edits records. */
export function ProfileRoute({ db = kairosDatabase, now = wallClock, downloads, readBackupFile = readFileText, durability = releasedDurability }: ProfileRouteProps) {
  const ports = useMemo(() => downloads ?? createBrowserBackupDownloadPorts(window), [downloads]);
  const metadata = useMemo(() => createKairosRepositories(db).metadata, [db]);
  const receipts = useMemo(() => new ActivationReceiptRepository(metadata), [metadata]);
  const [lastBackup, setLastBackup] = useState<LastBackupState>({ kind: 'loading' });
  const [storage, setStorage] = useState<StorageDurabilityStatus>({ state: 'unknown', persistent: false });
  const [persist, setPersist] = useState<PersistState>({ kind: 'idle' });
  const [activation, setActivation] = useState<ActivationState>({ kind: 'loading' });
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });
  const [restoreState, setRestoreState] = useState<RestoreState>({ kind: 'idle' });
  const [pickerKey, setPickerKey] = useState(0);
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' });
  const [importPickerKey, setImportPickerKey] = useState(0);

  const loadActivation = useCallback(async (ignore: () => boolean) => {
    try {
      const stored = await receipts.load();
      if (!ignore()) setActivation({ kind: 'ready', stored });
    } catch {
      if (!ignore()) setActivation({ kind: 'error' });
    }
  }, [receipts]);

  useEffect(() => {
    let ignored = false;
    void loadActivation(() => ignored);
    return () => { ignored = true; };
  }, [loadActivation]);

  useEffect(() => {
    let ignored = false;
    readLastBackup(metadata).then(record => { if (!ignored) setLastBackup({ kind: 'ready', record }); }).catch(() => { if (!ignored) setLastBackup({ kind: 'ready', record: null }); });
    return () => { ignored = true; };
  }, [metadata]);

  useEffect(() => {
    const unsubscribe = durability.subscribe(status => setStorage(status));
    void durability.inspect().catch(() => {});
    return unsubscribe;
  }, [durability]);

  async function handlePersist(): Promise<void> {
    if (persist.kind === 'requesting') return;
    setPersist({ kind: 'requesting' });
    try {
      const status = await durability.request();
      setStorage(status);
      setPersist(status.persistent ? { kind: 'idle' } : { kind: 'declined' });
    } catch {
      setPersist({ kind: 'declined' });
    }
  }

  const download = (file: KairosBackupFile): boolean => {
    try { handBackupFileToBrowser(file, ports); return true; } catch { return false; }
  };

  async function handleExport(): Promise<void> {
    if (exportState.kind === 'busy') return;
    setExportState({ kind: 'busy' });
    const result = await exportKairosBackup(db, new Date(now()));
    if (!result.ok) { setExportState({ kind: 'error', message: exportFailureText(result) }); return; }
    if (!download(result.file)) { setExportState({ kind: 'error', message: 'Your browser did not accept the download. Nothing was changed.' }); return; }
    setExportState({ kind: 'done', file: result.file, skippedCount: result.skipped.savedAnalyses + result.skipped.savedTimeAssistedSnapshots + result.skipped.tradeDiscipline });
    const recorded = await recordLastBackup(metadata, result.file);
    if (recorded.ok) setLastBackup({ kind: 'ready', record: recorded.record });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setRestoreState({ kind: 'reading' });
    let text: string;
    try { text = await readBackupFile(file); } catch { setRestoreState({ kind: 'refused', message: 'That file could not be read. Nothing was changed.' }); return; }
    const result = await prepareBackupRestore(db, text);
    setRestoreState(result.ok ? { kind: 'preview', fileName: file.name, restore: result.restore } : { kind: 'refused', message: prepareFailureText(result) });
  }

  function cancelRestore(): void { setRestoreState({ kind: 'idle' }); setPickerKey(value => value + 1); }

  async function handleCommit(): Promise<void> {
    if (restoreState.kind !== 'preview') return;
    const { fileName, restore } = restoreState;
    setRestoreState({ kind: 'committing', fileName, restore });
    const result = await commitBackupRestore(db, restore);
    setPickerKey(value => value + 1);
    if (!result.ok) { setRestoreState({ kind: 'failed', message: commitFailureText(result), recoveryFile: result.recoveryFile }); return; }
    setRestoreState({ kind: 'restored', fileName, reloadedTotalRecords: result.restored.reloadedTotalRecords });
    setExportState({ kind: 'idle' });
    setActivation({ kind: 'loading' });
    void loadActivation(() => false);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportState({ kind: 'reading' });
    let text: string;
    try { text = await readBackupFile(file); } catch { setImportState({ kind: 'refused', message: 'That file could not be read. Nothing was changed.' }); return; }
    const result = await prepareTradeImport(db, text);
    if (!result.ok) { setImportState({ kind: 'refused', message: importPrepareFailureText(result) }); return; }
    const records = await prepareSavedRecordImport(db, text);
    if (!records.ok) { setImportState({ kind: 'refused', message: recordsPrepareFailureText(records) }); return; }
    setImportState({ kind: 'preview', fileName: file.name, import: result.import, records: records.import });
  }

  function cancelImport(): void { setImportState({ kind: 'idle' }); setImportPickerKey(value => value + 1); }

  async function handleImportCommit(): Promise<void> {
    if (importState.kind !== 'preview') return;
    const { fileName, import: prepared, records } = importState;
    setImportState({ kind: 'committing', fileName, import: prepared, records });
    const result = await commitTradeImport(db, prepared);
    if (!result.ok) { setImportPickerKey(value => value + 1); setImportState({ kind: 'failed', message: importCommitFailureText(result) }); return; }
    const recordsResult = await commitSavedRecordImport(db, records);
    setImportPickerKey(value => value + 1);
    if (!recordsResult.ok) { setImportState({ kind: 'failed', message: `Added ${plural(result.added.trades, 'trade')}, but Kairos could not write the saved analyses and snapshots. Choose the file again to add them.` }); return; }
    setImportState({ kind: 'done', fileName, added: result.added, skipped: result.skipped, records: recordsResult.added, recordsSkipped: recordsResult.skipped });
    setExportState({ kind: 'idle' });
  }

  const restoreBusy = restoreState.kind === 'reading' || restoreState.kind === 'committing';
  const importBusy = importState.kind === 'reading' || importState.kind === 'committing';
  const importPreview = importState.kind === 'preview' || importState.kind === 'committing' ? importState.import.preview : null;
  const recordsPreview = importState.kind === 'preview' || importState.kind === 'committing' ? importState.records.preview : null;
  const importNew = importPreview && recordsPreview ? importPreview.newTrades + importPreview.newPracticeTrades + recordsPreview.newAnalyses + recordsPreview.newSnapshots : 0;
  const preview = restoreState.kind === 'preview' || restoreState.kind === 'committing' ? restoreState.restore.preview : null;

  return <section className="kairos-route kairos-profile" aria-labelledby="kairos-profile-title" data-profile-export={exportState.kind} data-profile-restore={restoreState.kind} data-profile-import={importState.kind}>
    <div className="kairos-profile__heading"><div><p className="kairos-profile__eyebrow">Your data</p><h1 id="kairos-profile-title">Profile</h1></div></div>

    <article className="kairos-profile-card" aria-labelledby="kairos-profile-device-title">
      <h2 id="kairos-profile-device-title">This device</h2>
      <Activation state={activation} />
      <p data-profile-last-backup={lastBackup.kind === 'loading' ? 'loading' : lastBackup.record ? 'recorded' : 'never'}>{lastBackup.kind === 'loading' ? 'Reading when this device was last backed up…' : lastBackup.record ? <>Last backup: {moment(lastBackup.record.exportedAt)} · <code>{lastBackup.record.fileName}</code> · {plural(lastBackup.record.totalRecords, 'record')}.</> : 'Last backup: never on this device. Download one below.'}</p>
      <p data-profile-storage={storage.state}>{durabilityText(storage)}</p>
      {storage.state === 'best-effort' ? <div className="kairos-profile-card__actions"><button type="button" className="kairos-profile-button--secondary" onClick={() => { void handlePersist(); }} disabled={persist.kind === 'requesting'}>{persist.kind === 'requesting' ? 'Asking…' : 'Keep my data on this device'}</button></div> : null}
      {persist.kind === 'declined' ? <p className="kairos-profile__note" role="status">The browser did not grant persistent storage this time. Keep a recent backup.</p> : null}
      <p className="kairos-profile__note">Kairos {buildInfo.appVersion} · build {buildInfo.buildId}. Everything you record stays on this device unless you export it.</p>
    </article>

    <article className="kairos-profile-card" aria-labelledby="kairos-profile-export-title">
      <h2 id="kairos-profile-export-title">Export a backup</h2>
      <p>Downloads one JSON file with your journal, saved analyses, saved snapshots and preferences. Your data is not changed.</p>
      <div className="kairos-profile-card__actions"><button type="button" onClick={() => { void handleExport(); }} disabled={exportState.kind === 'busy' || restoreBusy}>{exportState.kind === 'busy' ? 'Preparing…' : 'Download backup'}</button></div>
      {exportState.kind === 'done' ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--success" role="status">Backup downloaded: <code>{exportState.file.fileName}</code> · {plural(exportState.file.recordCounts.total, 'record')} · {kilobytes(exportState.file.byteLength)}.</p> : null}
      {exportState.kind === 'done' && exportState.skippedCount > 0 ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--error" role="status">Backup saved. {plural(exportState.skippedCount, 'saved item')} {exportState.skippedCount === 1 ? 'was' : 'were'} damaged and left out; {exportState.skippedCount === 1 ? 'it is' : 'they are'} still on this device.</p> : null}
      {exportState.kind === 'error' ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--error" role="alert">{exportState.message}</p> : null}
    </article>

    <article className="kairos-profile-card" aria-labelledby="kairos-profile-import-title">
      <h2 id="kairos-profile-import-title">Import trades</h2>
      <p>Add the trades, saved analyses and saved snapshots from another Kairos backup that this device does not have yet. Records already here are left exactly as they are.</p>
      <label className="kairos-profile-field" htmlFor="kairos-profile-import-file"><span>Backup file to import from</span><input key={importPickerKey} id="kairos-profile-import-file" type="file" accept="application/json,.json" onChange={event => { void handleImportFile(event); }} disabled={importBusy || importState.kind === 'preview'} /></label>
      {importState.kind === 'reading' ? <p className="kairos-profile__note" role="status">Reading the backup…</p> : null}
      {importState.kind === 'refused' || importState.kind === 'failed' ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--error" role="alert">{importState.message}</p> : null}
      {importPreview && recordsPreview && (importState.kind === 'preview' || importState.kind === 'committing') ? <div className="kairos-profile-preview" data-profile-import-new={importNew}>
        <p><strong>{importState.fileName}</strong> was exported {moment(importPreview.exportedAt)}. It holds {plural(importPreview.newTrades, 'trade')} and {plural(importPreview.newPracticeTrades, 'practice trade')} this device does not have, with {plural(importPreview.executions, 'fill')}, {plural(importPreview.fees, 'fee')} and {plural(importPreview.plans, 'plan')}; {plural(importPreview.alreadyPresent, 'trade')} already here will be left as they are.</p>
        <p data-profile-import-records={recordsPreview.newAnalyses + recordsPreview.newSnapshots}>It also holds {plural(recordsPreview.newAnalyses, 'saved analysis', 'saved analyses')} and {plural(recordsPreview.newSnapshots, 'saved snapshot')} this device does not have; {plural(recordsPreview.analysesPresent + recordsPreview.snapshotsPresent, 'saved record')} already here will be left as they are.</p>
        <div className="kairos-profile-card__actions">
          <button type="button" onClick={() => { void handleImportCommit(); }} disabled={importBusy || importNew === 0}>{importState.kind === 'committing' ? 'Adding…' : 'Add these records'}</button>
          <button type="button" className="kairos-profile-button--secondary" onClick={cancelImport} disabled={importBusy}>Cancel</button>
        </div>
      </div> : null}
      {importState.kind === 'done' ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--success" role="status">Added {plural(importState.added.trades, 'trade')} from <code>{importState.fileName}</code> with {plural(importState.added.executions, 'fill')}, {plural(importState.added.fees, 'fee')} and {plural(importState.added.plans, 'plan')}, plus {plural(importState.records.analyses, 'saved analysis', 'saved analyses')} and {plural(importState.records.snapshots, 'saved snapshot')}{importState.skipped + importState.recordsSkipped > 0 ? `; ${plural(importState.skipped + importState.recordsSkipped, 'record')} appeared meanwhile and ${importState.skipped + importState.recordsSkipped === 1 ? 'was' : 'were'} left alone` : ''}. Imported trades show their source as Import.</p> : null}
    </article>

    <article className="kairos-profile-card" aria-labelledby="kairos-profile-restore-title">
      <h2 id="kairos-profile-restore-title">Restore a backup</h2>
      <p>Choose a Kairos backup file. You will see what it holds before anything is replaced.</p>
      <label className="kairos-profile-field" htmlFor="kairos-profile-backup-file"><span>Backup file</span><input key={pickerKey} id="kairos-profile-backup-file" type="file" accept="application/json,.json" onChange={event => { void handleFile(event); }} disabled={restoreBusy || restoreState.kind === 'preview'} /></label>
      {restoreState.kind === 'reading' ? <p className="kairos-profile__note" role="status">Reading the backup…</p> : null}
      {restoreState.kind === 'refused' ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--error" role="alert">{restoreState.message}</p> : null}
      {preview && (restoreState.kind === 'preview' || restoreState.kind === 'committing') ? <div className="kairos-profile-preview" data-profile-preview-records={preview.totalRecords}>
        <p><strong>{restoreState.fileName}</strong> was exported {moment(preview.exportedAt)} and holds {plural(preview.totalRecords, 'record')}: {plural(preview.tradeRecords, 'trade')}, {plural(preview.savedAnalysisRecords, 'saved analysis', 'saved analyses')}, {plural(preview.savedTimeAssistedSnapshotRecords, 'saved snapshot')}, {plural(preview.metadataRecords, 'preference')}.</p>
        <p className="kairos-profile-preview__warning" role="status">Restoring replaces everything on this device with this backup. Your current data is offered as a download first.</p>
        {restoreState.restore.recoveryKind === 'raw' ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--error" role="alert">Your current data has a problem. Download the raw copy first; it may not restore.</p> : null}
        <div className="kairos-profile-card__actions">
          <button type="button" className="kairos-profile-button--secondary" onClick={() => { download(restoreState.restore.recoveryFile); }} disabled={restoreBusy}>Download current data first</button>
          <button type="button" className="kairos-profile-button--danger" onClick={() => { void handleCommit(); }} disabled={restoreBusy}>{restoreState.kind === 'committing' ? 'Restoring…' : 'Replace my data'}</button>
          <button type="button" className="kairos-profile-button--secondary" onClick={cancelRestore} disabled={restoreBusy}>Cancel</button>
        </div>
      </div> : null}
      {restoreState.kind === 'restored' ? <p className="kairos-profile-card__feedback kairos-profile-card__feedback--success" role="status">Restored {plural(restoreState.reloadedTotalRecords, 'record')} from <code>{restoreState.fileName}</code> and verified them after reopening. Other pages show the restored data when you open them.</p> : null}
      {restoreState.kind === 'failed' ? <div className="kairos-profile-card__feedback kairos-profile-card__feedback--error"><p role="alert">{restoreState.message} Your data from before the restore is available as a download.</p><div className="kairos-profile-card__actions"><button type="button" className="kairos-profile-button--secondary" onClick={() => { download(restoreState.recoveryFile); }}>Download the pre-restore copy</button></div></div> : null}
    </article>
  </section>;
}
