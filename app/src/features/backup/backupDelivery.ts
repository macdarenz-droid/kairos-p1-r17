import { createBrowserBackupDownloadPorts, handBackupFileToBrowser, loadBackupFolder, type BackupDeliver, type BackupDownloadPorts, type KairosBackupFile } from '../../application/backup';
import type { KairosDatabase } from '../../data/database';

/** A writable file in the folder, as far as Kairos uses it. */
interface BackupFolderWritable { write(data: string): Promise<void>; close(): Promise<void> }
/** The browser's folder handle (File System Access, on computers), as far as Kairos uses it. */
export interface BackupFolderHandlePort {
  readonly name: string;
  queryPermission?(descriptor: { readonly mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { readonly mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options: { readonly create: boolean }): Promise<{ createWritable(): Promise<BackupFolderWritable> }>;
}
/** The browser's share sheet (on phones), as far as Kairos uses it. */
export interface BackupSharePort {
  canShare?(data: { readonly files: File[] }): boolean;
  share?(data: { readonly files: File[]; readonly title?: string }): Promise<void>;
}
export interface BackupDeliveryPorts {
  readonly downloads: BackupDownloadPorts;
  readonly share?: BackupSharePort;
  /** The saved folder's handle, read each time a backup runs; null without one. */
  readonly folder?: () => Promise<BackupFolderHandlePort | null>;
}

const isAbort = (error: unknown): boolean => typeof error === 'object' && error !== null && (error as { readonly name?: unknown }).name === 'AbortError';

/** Writes the file into the folder, asking for permission once if the browser wants it; false when it cannot. */
async function writeToFolder(folder: BackupFolderHandlePort, file: KairosBackupFile): Promise<boolean> {
  try {
    let permission: PermissionState = (await folder.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (permission === 'prompt') permission = (await folder.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    if (permission !== 'granted') return false;
    const writable = await (await folder.getFileHandle(file.fileName, { create: true })).createWritable();
    await writable.write(file.contents);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * D227: where a backup goes, in order: the saved backup folder (computers), the share sheet when it can share files
 * (phones: Files, Drive, email, AirDrop), else a download. A share the trader closes is "cancelled" (nothing recorded);
 * a folder or share that fails falls through to the download, and a refused download is "failed".
 */
export function createBackupDelivery(ports: BackupDeliveryPorts): BackupDeliver {
  return async file => {
    const folder = await (ports.folder?.() ?? Promise.resolve(null)).catch(() => null);
    if (folder !== null && await writeToFolder(folder, file)) return { outcome: 'saved', via: 'folder', place: folder.name };
    const share = ports.share;
    if (share?.canShare !== undefined && share.share !== undefined) {
      const shared = new File([file.contents], file.fileName, { type: file.mediaType });
      let can = false;
      try { can = share.canShare({ files: [shared] }); } catch { can = false; }
      if (can) {
        try {
          await share.share({ files: [shared], title: 'Kairos backup' });
          return { outcome: 'saved', via: 'share', place: null };
        } catch (error) {
          if (isAbort(error)) return 'cancelled';
        }
      }
    }
    try {
      handBackupFileToBrowser(file, ports.downloads);
      return { outcome: 'saved', via: 'download', place: null };
    } catch {
      return 'failed';
    }
  };
}

/** Whether this browser can keep a backup folder (File System Access). */
export const canChooseBackupFolder = (win: Window = window): boolean => typeof (win as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

/** The real browser: its downloads, its share sheet and the folder saved for this journal. */
export function createBrowserBackupDelivery(db: KairosDatabase, downloads: BackupDownloadPorts = createBrowserBackupDownloadPorts(window)): BackupDeliver {
  return createBackupDelivery({
    downloads,
    share: window.navigator as Navigator & BackupSharePort,
    folder: async () => ((await loadBackupFolder(db))?.handle as BackupFolderHandlePort | undefined) ?? null,
  });
}
