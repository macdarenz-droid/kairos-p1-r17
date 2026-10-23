/**
 * T-054a (D226): one backup run, for every "Back up now" (the page, the reminder card, and later the crash screen):
 * export, hand the file to where it goes, and record the last backup only when it was saved.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { exportKairosBackup, type ExportKairosBackupResult, type KairosBackupFile } from './exportBackup';
import { recordLastBackup, type LastBackupRecord } from './lastBackup';

/** What the browser side did with the file. */
export type BackupDeliveryOutcome = 'saved' | 'cancelled' | 'failed';
/** Where a saved backup went (T-054b, D227): into a folder (its name), to the share sheet, or as a download. */
export type BackupDeliveryWay = 'folder' | 'share' | 'download';
export interface BackupDelivered {
  readonly outcome: 'saved';
  readonly via: BackupDeliveryWay;
  readonly place: string | null;
  /** The chosen backup folder that could not be written, so the backup went another way (T-054b fix r1). */
  readonly missedFolder?: string | null;
}
/** Where a backup goes: the browser side, supplied by the screen. A plain 'saved' says nothing of where. */
export type BackupDeliver = (file: KairosBackupFile) => Promise<BackupDeliveryOutcome | BackupDelivered>;

export type RunBackupResult =
  | { readonly ok: true; readonly file: KairosBackupFile; /** Damaged saved items left out; they stay on the device. */ readonly skippedCount: number; readonly record: LastBackupRecord; readonly via: BackupDeliveryWay | null; readonly place: string | null; readonly missedFolder: string | null }
  | { readonly ok: false; readonly reason: 'cancelled' | 'delivery-failed' | 'record-failed' }
  | { readonly ok: false; readonly reason: 'export-failed'; readonly export: Exclude<ExportKairosBackupResult, { ok: true }> };

const wallClock = (): string => new Date().toISOString();

export async function runBackup(db: KairosDatabase, deliver: BackupDeliver, dependencies: { readonly now?: () => string } = {}): Promise<RunBackupResult> {
  const exported = await exportKairosBackup(db, new Date((dependencies.now ?? wallClock)()));
  if (!exported.ok) return { ok: false, reason: 'export-failed', export: exported };
  let delivered: BackupDeliveryOutcome | BackupDelivered;
  try { delivered = await deliver(exported.file); } catch { delivered = 'failed'; }
  if (delivered === 'cancelled') return { ok: false, reason: 'cancelled' };
  if (delivered === 'failed') return { ok: false, reason: 'delivery-failed' };
  let recorded: Awaited<ReturnType<typeof recordLastBackup>>;
  try {
    // One atomic write, like every write (T-054a fix r1).
    recorded = await runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => recordLastBackup(repositories.metadata, exported.file));
  } catch {
    return { ok: false, reason: 'record-failed' };
  }
  if (!recorded.ok) return { ok: false, reason: 'record-failed' };
  const { skipped } = exported;
  const skippedCount = skipped.savedAnalyses + skipped.savedTimeAssistedSnapshots + skipped.tradeDiscipline + skipped.exchangeRates + skipped.economicEvents;
  const way = delivered === 'saved' ? { via: null, place: null, missedFolder: null } : { via: delivered.via, place: delivered.place, missedFolder: delivered.missedFolder ?? null };
  return { ok: true, file: exported.file, skippedCount, record: recorded.record, ...way };
}
