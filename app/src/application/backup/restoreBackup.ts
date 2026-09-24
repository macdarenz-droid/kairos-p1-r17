import {
  KairosBackupValidationError,
  KairosRestorePreflightError,
  KairosRestoreVerificationError,
  prepareKairosRestore,
  restoreAndVerifyKairosDatabase,
  type KairosBackupValidationCode,
  type KairosPreparedRestoreV2,
  type KairosRestorePreflightCode,
  type KairosRestorePreviewV2,
  type KairosRestoreVerificationCode,
} from '../../data/backup';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { DatabaseIntegrityError } from '../../data/database/integrity';
import { KAIROS_BACKUP_FILE_MEDIA_TYPE, kairosBackupFileNameAt, type KairosBackupFile } from './exportBackup';

export const KAIROS_BACKUP_RESTORE_MAX_BYTES = 64 * 1024 * 1024;

/** Everything a confirmation step needs to show before anything is written. */
export interface PreparedBackupRestore {
  readonly preview: KairosRestorePreviewV2;
  /** The pre-restore copy of this device's data, already a downloadable file. */
  readonly recoveryFile: KairosBackupFile;
  readonly prepared: KairosPreparedRestoreV2;
}

export type PrepareBackupRestoreResult =
  | { readonly ok: true; readonly restore: PreparedBackupRestore }
  | { readonly ok: false; readonly type: 'invalid-input'; readonly reason: 'backup-file-too-large'; readonly byteLength: number }
  | { readonly ok: false; readonly type: 'invalid-backup'; readonly reason: 'backup-unreadable'; readonly code: KairosBackupValidationCode }
  | { readonly ok: false; readonly type: 'incompatible-backup'; readonly reason: 'restore-preflight-refused'; readonly code: KairosRestorePreflightCode }
  | { readonly ok: false; readonly type: 'integrity-error'; readonly reason: 'database-integrity-failed'; readonly failedChecks: readonly string[] }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'restore-prepare-failed' };

export interface CommittedBackupRestore {
  readonly restoredMetadataRecords: number;
  readonly restoredTradeRecords: number;
  readonly restoredSavedAnalysisRecords: number;
  readonly restoredSavedTimeAssistedSnapshotRecords: number;
  readonly reloadedTotalRecords: number;
  readonly verifiedAfterReload: true;
}

export type CommitBackupRestoreResult =
  | { readonly ok: true; readonly restored: CommittedBackupRestore }
  | { readonly ok: false; readonly type: 'verification-error'; readonly reason: 'restore-verification-failed'; readonly code: KairosRestoreVerificationCode; readonly recoveryFile: KairosBackupFile }
  | { readonly ok: false; readonly type: 'integrity-error'; readonly reason: 'database-integrity-failed'; readonly failedChecks: readonly string[]; readonly recoveryFile: KairosBackupFile }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'restore-replacement-failed'; readonly recoveryFile: KairosBackupFile };

function recoveryFileOf(prepared: KairosPreparedRestoreV2): KairosBackupFile {
  const { envelope, serialized } = prepared.recovery;
  return Object.freeze({
    fileName: kairosBackupFileNameAt(new Date(envelope.exportedAt)),
    mediaType: KAIROS_BACKUP_FILE_MEDIA_TYPE,
    contents: serialized,
    byteLength: new TextEncoder().encode(serialized).byteLength,
    exportedAt: envelope.exportedAt,
    recordCounts: envelope.recordCounts,
  });
}

/**
 * P28.2 backup restore application command, step one.
 *
 * Owns only the composition of the released P6.3 preflight (parse, migrate,
 * validate, compatibility) with the released recovery snapshot into one
 * explicit outcome. Nothing is written: the caller shows the preview and the
 * pre-restore copy, and only an explicit confirmation reaches `commitBackupRestore`.
 */
export async function prepareBackupRestore(db: KairosDatabase, serializedBackup: string): Promise<PrepareBackupRestoreResult> {
  const byteLength = new TextEncoder().encode(serializedBackup).byteLength;
  if (byteLength > KAIROS_BACKUP_RESTORE_MAX_BYTES) return { ok: false, type: 'invalid-input', reason: 'backup-file-too-large', byteLength };
  try {
    const prepared = await prepareKairosRestore(db, serializedBackup);
    return { ok: true, restore: Object.freeze({ preview: prepared.preview, recoveryFile: recoveryFileOf(prepared), prepared }) };
  } catch (error) {
    if (error instanceof KairosBackupValidationError) return { ok: false, type: 'invalid-backup', reason: 'backup-unreadable', code: error.code };
    if (error instanceof KairosRestorePreflightError) return { ok: false, type: 'incompatible-backup', reason: 'restore-preflight-refused', code: error.code };
    if (error instanceof DatabaseIntegrityError) return { ok: false, type: 'integrity-error', reason: 'database-integrity-failed', failedChecks: error.report.checks.filter(check => !check.ok).map(check => check.id) };
    return { ok: false, type: 'storage-error', reason: 'restore-prepare-failed' };
  }
}

/**
 * P28.2 backup restore application command, step two: the confirmed replacement
 * through the released P6.4 atomic replacement and P6.5 reopen/re-query
 * verification. Every failure outcome carries the pre-restore copy so the user
 * can always get their previous data back.
 */
export async function commitBackupRestore(db: KairosDatabase, restore: PreparedBackupRestore): Promise<CommitBackupRestoreResult> {
  try {
    const verified = await restoreAndVerifyKairosDatabase(db, restore.prepared);
    return {
      ok: true,
      restored: Object.freeze({
        restoredMetadataRecords: verified.restoredMetadataRecords,
        restoredTradeRecords: verified.restoredTradeRecords,
        restoredSavedAnalysisRecords: verified.restoredSavedAnalysisRecords,
        restoredSavedTimeAssistedSnapshotRecords: verified.restoredSavedTimeAssistedSnapshotRecords,
        reloadedTotalRecords: verified.reloadedTotalRecords,
        verifiedAfterReload: verified.verifiedAfterReload,
      }),
    };
  } catch (error) {
    if (error instanceof KairosRestoreVerificationError) return { ok: false, type: 'verification-error', reason: 'restore-verification-failed', code: error.code, recoveryFile: restore.recoveryFile };
    if (error instanceof DatabaseIntegrityError) return { ok: false, type: 'integrity-error', reason: 'database-integrity-failed', failedChecks: error.report.checks.filter(check => !check.ok).map(check => check.id), recoveryFile: restore.recoveryFile };
    return { ok: false, type: 'storage-error', reason: 'restore-replacement-failed', recoveryFile: restore.recoveryFile };
  }
}
