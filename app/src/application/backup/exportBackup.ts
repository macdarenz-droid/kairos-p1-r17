import { createKairosDatabaseSnapshot, serializeKairosBackup, type KairosBackupRecordCountsV4 } from '../../data/backup';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { DatabaseIntegrityError } from '../../data/database/integrity';

export const KAIROS_BACKUP_FILE_MEDIA_TYPE = 'application/json' as const;
export const KAIROS_BACKUP_FILE_PREFIX = 'kairos-backup-' as const;
export const KAIROS_BACKUP_FILE_EXTENSION = '.json' as const;

/** One exported backup, ready to hand to the browser: nothing here has touched a store. */
export interface KairosBackupFile {
  readonly fileName: string;
  readonly mediaType: typeof KAIROS_BACKUP_FILE_MEDIA_TYPE;
  readonly contents: string;
  readonly byteLength: number;
  readonly exportedAt: string;
  readonly recordCounts: KairosBackupRecordCountsV4;
}

export type ExportKairosBackupResult =
  | { readonly ok: true; readonly file: KairosBackupFile }
  | { readonly ok: false; readonly type: 'invalid-input'; readonly reason: 'export-moment-invalid' }
  | { readonly ok: false; readonly type: 'integrity-error'; readonly reason: 'database-integrity-failed'; readonly failedChecks: readonly string[] }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'backup-export-failed' };

/** `kairos-backup-2026-09-18T15-51-00Z.json`: the UTC export moment to the second, filesystem-safe and sortable. */
export function kairosBackupFileNameAt(exportedAt: Date): string {
  const stamp = exportedAt.toISOString().slice(0, 19).replace(/:/g, '-');
  return `${KAIROS_BACKUP_FILE_PREFIX}${stamp}Z${KAIROS_BACKUP_FILE_EXTENSION}`;
}

/**
 * P28.1 backup export application command.
 *
 * Owns only the composition of the released P6 snapshot into one named file:
 * the integrity-checked, device-metadata-free V4 envelope from
 * `createKairosDatabaseSnapshot`, serialised through `serializeKairosBackup`,
 * named from the caller's explicit export moment. It reads and never writes;
 * the download itself is handed to the browser by `handBackupFileToBrowser`.
 */
export async function exportKairosBackup(db: KairosDatabase, exportedAt: Date): Promise<ExportKairosBackupResult> {
  if (!(exportedAt instanceof Date) || Number.isNaN(exportedAt.getTime())) return { ok: false, type: 'invalid-input', reason: 'export-moment-invalid' };
  try {
    const envelope = await createKairosDatabaseSnapshot(db, { exportedAt });
    const contents = serializeKairosBackup(envelope);
    const file: KairosBackupFile = Object.freeze({
      fileName: kairosBackupFileNameAt(exportedAt),
      mediaType: KAIROS_BACKUP_FILE_MEDIA_TYPE,
      contents,
      byteLength: new TextEncoder().encode(contents).byteLength,
      exportedAt: envelope.exportedAt,
      recordCounts: envelope.recordCounts,
    });
    return { ok: true, file };
  } catch (error) {
    if (error instanceof DatabaseIntegrityError) {
      return { ok: false, type: 'integrity-error', reason: 'database-integrity-failed', failedChecks: error.report.checks.filter(check => !check.ok).map(check => check.id) };
    }
    return { ok: false, type: 'storage-error', reason: 'backup-export-failed' };
  }
}

/** The three browser facts a download needs; the route supplies the real window, tests supply fakes. */
export interface BackupDownloadPorts {
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  readonly triggerDownload: (url: string, fileName: string) => void;
}

/** The subset of the browser window a download needs. */
export type BackupDownloadWindow = Pick<Window & typeof globalThis, 'URL' | 'document'>;

export function createBrowserBackupDownloadPorts(window: BackupDownloadWindow): BackupDownloadPorts {
  return {
    createObjectUrl: blob => window.URL.createObjectURL(blob),
    revokeObjectUrl: url => window.URL.revokeObjectURL(url),
    triggerDownload: (url, fileName) => {
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      window.document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
  };
}

/** Hands one exported file to the browser as a download and releases the object URL afterwards, whatever the click did. */
export function handBackupFileToBrowser(file: KairosBackupFile, ports: BackupDownloadPorts): void {
  const url = ports.createObjectUrl(new Blob([file.contents], { type: file.mediaType }));
  try {
    ports.triggerDownload(url, file.fileName);
  } finally {
    ports.revokeObjectUrl(url);
  }
}
