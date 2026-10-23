import { handBackupFileToBrowser, type BackupDeliver, type BackupDownloadPorts } from '../../application/backup';

/**
 * D227: where a backup goes. T-054a hands it to the browser as a download; a browser that refuses the download
 * (it throws) answers "failed", so nothing is recorded.
 */
export function createBackupDelivery({ downloads }: { readonly downloads: BackupDownloadPorts }): BackupDeliver {
  return async file => {
    try {
      handBackupFileToBrowser(file, downloads);
      return 'saved';
    } catch {
      return 'failed';
    }
  };
}
