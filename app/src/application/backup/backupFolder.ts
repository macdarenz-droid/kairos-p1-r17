/**
 * T-054b (D227): the backup folder a browser lets Kairos write to, on this device only (the `deviceHandles` store,
 * never in a backup, kept by a restore). The handle is the browser's own object; this file only keeps and forgets it.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';

export const BACKUP_FOLDER_HANDLE_KEY = 'backup-folder';

export interface BackupFolder {
  /** The folder's name as the browser reports it. */
  readonly name: string;
  /** The browser's folder handle, kept as it was given. */
  readonly handle: unknown;
}

export type BackupFolderWriteResult = { readonly ok: true } | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'backup-folder-save-failed' };

const wallClock = (): string => new Date().toISOString();

/** The chosen folder, or null when none was chosen on this device (or the record is unreadable). */
export async function loadBackupFolder(db: KairosDatabase): Promise<BackupFolder | null> {
  const record = await createKairosRepositories(db).deviceHandles.get(BACKUP_FOLDER_HANDLE_KEY);
  if (!record || typeof record.name !== 'string' || record.name === '' || record.handle === null || typeof record.handle !== 'object') return null;
  return Object.freeze({ name: record.name, handle: record.handle });
}

/** "Choose a backup folder": keeps the browser's handle for the next backups. */
export async function saveBackupFolder(db: KairosDatabase, folder: BackupFolder, dependencies: { readonly now?: () => string } = {}): Promise<BackupFolderWriteResult> {
  try {
    const savedAt = (dependencies.now ?? wallClock)();
    await runKairosAtomicWrite(db, ['deviceHandles'], async ({ repositories }) => {
      await repositories.deviceHandles.put({ key: BACKUP_FOLDER_HANDLE_KEY, name: folder.name, handle: folder.handle, savedAt });
    });
    return { ok: true };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'backup-folder-save-failed' };
  }
}

/** "Stop using this folder": the next backups go to the share sheet or a download. */
export async function clearBackupFolder(db: KairosDatabase): Promise<BackupFolderWriteResult> {
  try {
    await runKairosAtomicWrite(db, ['deviceHandles'], async ({ repositories }) => { await repositories.deviceHandles.delete(BACKUP_FOLDER_HANDLE_KEY); });
    return { ok: true };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'backup-folder-save-failed' };
  }
}
