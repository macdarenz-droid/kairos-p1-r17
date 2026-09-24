import {
  KairosBackupValidationError,
  KairosRestorePreflightError,
  preflightKairosRestore,
  type KairosBackupValidationCode,
  type KairosRestorePreflightCode,
} from '../../data/backup';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import type { SavedAnalysis } from '../../app/savedAnalysisContract';
import type { SavedTimeAssistedSnapshot } from '../../app/savedTimeAssistedSnapshotContract';
import { KAIROS_BACKUP_RESTORE_MAX_BYTES } from './restoreBackup';

export interface SavedRecordImportPreview {
  readonly exportedAt: string;
  readonly formatVersion: number;
  readonly newAnalyses: number;
  readonly newSnapshots: number;
  readonly analysesPresent: number;
  readonly snapshotsPresent: number;
}

export interface PreparedSavedRecordImport {
  readonly preview: SavedRecordImportPreview;
  readonly analyses: readonly SavedAnalysis[];
  readonly snapshots: readonly SavedTimeAssistedSnapshot[];
}

export type PrepareSavedRecordImportResult =
  | { readonly ok: true; readonly import: PreparedSavedRecordImport }
  | { readonly ok: false; readonly type: 'invalid-input'; readonly reason: 'backup-file-too-large'; readonly byteLength: number }
  | { readonly ok: false; readonly type: 'invalid-backup'; readonly reason: 'backup-unreadable'; readonly code: KairosBackupValidationCode }
  | { readonly ok: false; readonly type: 'incompatible-backup'; readonly reason: 'import-preflight-refused'; readonly code: KairosRestorePreflightCode }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'import-prepare-failed' };

export type CommitSavedRecordImportResult =
  | { readonly ok: true; readonly added: Readonly<{ analyses: number; snapshots: number }>; readonly skipped: number }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'import-commit-failed' };

/**
 * P33.1 saved-record merge-import application command, step one.
 *
 * Reads a Kairos backup through the released P6 parse and preflight and
 * selects the Saved Analyses and saved time-assisted snapshots whose ids are
 * not on this device. Every selected record stays byte-identical, its P25
 * label included; nothing is written until `commitSavedRecordImport`.
 */
export async function prepareSavedRecordImport(db: KairosDatabase, serializedBackup: string): Promise<PrepareSavedRecordImportResult> {
  const byteLength = new TextEncoder().encode(serializedBackup).byteLength;
  if (byteLength > KAIROS_BACKUP_RESTORE_MAX_BYTES) return { ok: false, type: 'invalid-input', reason: 'backup-file-too-large', byteLength };
  let incoming;
  try {
    incoming = preflightKairosRestore(serializedBackup).incoming;
  } catch (error) {
    if (error instanceof KairosBackupValidationError) return { ok: false, type: 'invalid-backup', reason: 'backup-unreadable', code: error.code };
    if (error instanceof KairosRestorePreflightError) return { ok: false, type: 'incompatible-backup', reason: 'import-preflight-refused', code: error.code };
    return { ok: false, type: 'storage-error', reason: 'import-prepare-failed' };
  }
  try {
    const selection = await db.transaction('r', [db.savedAnalyses, db.savedTimeAssistedSnapshots], async () => {
      const analysisIds = new Set((await db.savedAnalyses.toCollection().primaryKeys()) as string[]);
      const snapshotIds = new Set((await db.savedTimeAssistedSnapshots.toCollection().primaryKeys()) as string[]);
      return {
        analyses: incoming.payload.savedAnalyses.filter(record => !analysisIds.has(record.id)).map(record => structuredClone(record)),
        snapshots: incoming.payload.savedTimeAssistedSnapshots.filter(record => !snapshotIds.has(record.id)).map(record => structuredClone(record)),
      };
    });
    const preview: SavedRecordImportPreview = Object.freeze({
      exportedAt: incoming.exportedAt,
      formatVersion: incoming.formatVersion,
      newAnalyses: selection.analyses.length,
      newSnapshots: selection.snapshots.length,
      analysesPresent: incoming.payload.savedAnalyses.length - selection.analyses.length,
      snapshotsPresent: incoming.payload.savedTimeAssistedSnapshots.length - selection.snapshots.length,
    });
    return { ok: true, import: Object.freeze({ preview, analyses: Object.freeze(selection.analyses), snapshots: Object.freeze(selection.snapshots) }) };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'import-prepare-failed' };
  }
}

/**
 * P33.1 saved-record merge-import application command, step two: the
 * confirmed write. Every selected id is re-checked inside the transaction; a
 * record that appeared meanwhile is skipped, and nothing already on the
 * device is ever replaced.
 */
export async function commitSavedRecordImport(db: KairosDatabase, prepared: PreparedSavedRecordImport): Promise<CommitSavedRecordImportResult> {
  try {
    return await runKairosAtomicWrite(db, ['savedAnalyses', 'savedTimeAssistedSnapshots'], async ({ repositories }): Promise<CommitSavedRecordImportResult> => {
      let analyses = 0, snapshots = 0, skipped = 0;
      for (const record of prepared.analyses) {
        if (await repositories.savedAnalyses.get(record.id)) { skipped += 1; continue; }
        await repositories.savedAnalyses.put(record); analyses += 1;
      }
      for (const record of prepared.snapshots) {
        if (await repositories.savedTimeAssistedSnapshots.get(record.id)) { skipped += 1; continue; }
        await repositories.savedTimeAssistedSnapshots.put(record); snapshots += 1;
      }
      return { ok: true, added: Object.freeze({ analyses, snapshots }), skipped };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'import-commit-failed' };
  }
}
