import { describe, expect, it } from 'vitest';
import type { BackupDownloadPorts, KairosBackupFile } from '../src/application/backup';
import { createBackupDelivery, type BackupFolderHandlePort, type BackupSharePort } from '../src/features/backup/backupDelivery';

const file = { fileName: 'kairos-backup-2026-10-23T10-00-00Z.json', mediaType: 'application/json', contents: '{"formatName":"kairos-full-backup"}', byteLength: 35, exportedAt: '2026-10-23T10:00:00.000Z', recordCounts: { total: 0 } } as unknown as KairosBackupFile;

function downloads(fails = false) {
  const names: string[] = [];
  const ports: BackupDownloadPorts = {
    createObjectUrl: () => 'blob:kairos/1',
    revokeObjectUrl: () => undefined,
    triggerDownload: (_url, name) => { if (fails) throw new Error('blocked'); names.push(name); },
  };
  return { ports, names };
}
function folder(permission: PermissionState, afterAsk: PermissionState = permission, writeFails = false) {
  const written: Array<[string, string]> = [];
  const asked: string[] = [];
  const handle: BackupFolderHandlePort = {
    name: 'Kairos backups',
    queryPermission: async () => permission,
    requestPermission: async () => { asked.push('readwrite'); return afterAsk; },
    getFileHandle: async name => ({ createWritable: async () => ({ write: async (data: string) => { if (writeFails) throw new Error('disk'); written.push([name, data]); }, close: async () => undefined }) }),
  };
  return { handle, written, asked };
}
function share(behaviour: 'shares' | 'cancels' | 'fails' | 'cannot') {
  const shared: File[] = [];
  const port: BackupSharePort = {
    canShare: () => behaviour !== 'cannot',
    share: async ({ files }) => {
      if (behaviour === 'cancels') throw new DOMException('closed', 'AbortError');
      if (behaviour === 'fails') throw new DOMException('not allowed', 'NotAllowedError');
      shared.push(...files);
    },
  };
  return { port, shared };
}

describe('T-054b where a backup goes', () => {
  it('writes into the saved folder when its permission is granted', async () => {
    const { handle, written } = folder('granted');
    const { ports, names } = downloads();
    expect(await createBackupDelivery({ downloads: ports, folder: async () => handle, share: share('shares').port })(file)).toEqual({ outcome: 'saved', via: 'folder', place: 'Kairos backups' });
    expect(written).toEqual([[file.fileName, file.contents]]);
    expect(names).toEqual([]);
  });

  it('asks once when the browser wants permission, and uses the folder when it is given', async () => {
    const { handle, written, asked } = folder('prompt', 'granted');
    expect(await createBackupDelivery({ downloads: downloads().ports, folder: async () => handle })(file)).toMatchObject({ outcome: 'saved', via: 'folder' });
    expect(asked).toEqual(['readwrite']);
    expect(written).toHaveLength(1);
  });

  it('falls through to the share sheet, then the download, when the folder is refused or cannot be written', async () => {
    const refused = folder('prompt', 'denied');
    const sheet = share('shares');
    expect(await createBackupDelivery({ downloads: downloads().ports, folder: async () => refused.handle, share: sheet.port })(file)).toEqual({ outcome: 'saved', via: 'share', place: null, missedFolder: 'Kairos backups' });
    expect(refused.written).toEqual([]);
    const broken = folder('granted', 'granted', true);
    const { ports, names } = downloads();
    expect(await createBackupDelivery({ downloads: ports, folder: async () => broken.handle })(file)).toEqual({ outcome: 'saved', via: 'download', place: null, missedFolder: 'Kairos backups' });
    expect(names).toEqual([file.fileName]);
  });

  it('shares the backup as a JSON file on a phone', async () => {
    const sheet = share('shares');
    const { ports, names } = downloads();
    expect(await createBackupDelivery({ downloads: ports, share: sheet.port, folder: async () => null })(file)).toMatchObject({ via: 'share' });
    expect(sheet.shared).toHaveLength(1);
    expect(sheet.shared[0]!.name).toBe(file.fileName);
    expect(sheet.shared[0]!.type).toBe('application/json');
    expect(await sheet.shared[0]!.text()).toBe(file.contents);
    expect(names).toEqual([]);
  });

  it('a closed share sheet is cancelled (no download); a share that fails, or cannot share files, downloads', async () => {
    const cancelled = downloads();
    expect(await createBackupDelivery({ downloads: cancelled.ports, share: share('cancels').port })(file)).toBe('cancelled');
    expect(cancelled.names).toEqual([]);
    const failed = downloads();
    expect(await createBackupDelivery({ downloads: failed.ports, share: share('fails').port })(file)).toMatchObject({ via: 'download' });
    const cannot = downloads();
    expect(await createBackupDelivery({ downloads: cannot.ports, share: share('cannot').port })(file)).toMatchObject({ via: 'download' });
    expect([failed.names, cannot.names]).toEqual([[file.fileName], [file.fileName]]);
  });

  it('with neither a folder nor a share sheet it downloads, and a refused download is "failed"', async () => {
    expect(await createBackupDelivery({ downloads: downloads().ports })(file)).toMatchObject({ via: 'download' });
    expect(await createBackupDelivery({ downloads: downloads(true).ports })(file)).toBe('failed');
    expect(await createBackupDelivery({ downloads: downloads().ports, folder: async () => { throw new Error('unreadable'); } })(file)).toMatchObject({ via: 'download' });
  });

  it('T-054b fix r1: a folder that fails mid-write throws the half-written file away, and the backup names the folder it missed', async () => {
    const aborted: string[] = [];
    const handle: BackupFolderHandlePort = {
      name: 'Kairos backups',
      queryPermission: async () => 'granted',
      getFileHandle: async name => ({ createWritable: async () => ({ write: async () => { throw new Error('disk'); }, close: async () => undefined, abort: async () => { aborted.push(name); } }) }),
    };
    expect(await createBackupDelivery({ downloads: downloads().ports, folder: async () => handle })(file)).toEqual({ outcome: 'saved', via: 'download', place: null, missedFolder: 'Kairos backups' });
    expect(aborted).toEqual([file.fileName]);
    expect(await createBackupDelivery({ downloads: downloads().ports, folder: async () => handle, share: share('shares').port })(file)).toEqual({ outcome: 'saved', via: 'share', place: null, missedFolder: 'Kairos backups' });
    // No folder chosen: nothing was missed.
    expect(await createBackupDelivery({ downloads: downloads().ports, folder: async () => null })(file)).toEqual({ outcome: 'saved', via: 'download', place: null, missedFolder: null });
  });
});
