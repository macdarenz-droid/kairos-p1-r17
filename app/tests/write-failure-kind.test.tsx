import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBackup, type BackupDownloadPorts } from '../src/application/backup';
import {
  classifyKairosWriteFailure,
  createKairosDatabase,
  openKairosDatabase,
  runKairosAtomicWrite,
  subscribeKairosWriteFailures,
  type KairosDatabase,
  type KairosWriteFailureKind,
} from '../src/data/database';
import { createBackupDelivery } from '../src/features/backup/backupDelivery';
import { DatabaseStatusBanner } from '../src/features/shell/DatabaseStatusBanner';

const names: string[] = [];
const opened: Dexie[] = [];
const stops: Array<() => void> = [];
afterEach(async () => {
  cleanup();
  for (const stop of stops.splice(0)) stop();
  for (const db of opened.splice(0)) db.close();
  for (const name of names.splice(0)) await Dexie.delete(name);
});
async function database(): Promise<KairosDatabase> {
  const name = `kairos-write-failure-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
function heard(): Array<KairosWriteFailureKind | null> {
  const kinds: Array<KairosWriteFailureKind | null> = [];
  stops.push(subscribeKairosWriteFailures(kind => kinds.push(kind)));
  return kinds;
}
const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
const note = { key: 'device.test.v1', value: '{}', updatedAt: '2026-10-23T10:00:00.000Z' };

describe('T-054d what a failed write was', () => {
  it('tells a full phone, a closed database and anything else apart, also inside Dexie\'s inner error', () => {
    expect(classifyKairosWriteFailure(full())).toBe('storage-full');
    expect(classifyKairosWriteFailure(new Dexie.AbortError('Transaction aborted', full()))).toBe('storage-full');
    expect(classifyKairosWriteFailure(new Dexie.QuotaExceededError('full'))).toBe('storage-full');
    expect(classifyKairosWriteFailure(new Dexie.DatabaseClosedError())).toBe('closed');
    expect(classifyKairosWriteFailure(new Dexie.ConstraintError('key exists'))).toBe('other');
    expect(classifyKairosWriteFailure(new Error('validation'))).toBe('other');
    expect(classifyKairosWriteFailure('not an error')).toBe('other');
  });

  it('a failed write reports its kind once and still throws, and the next committed write ends it', async () => {
    const db = await database();
    const kinds = heard();
    await expect(runKairosAtomicWrite(db, ['metadata'], async () => { throw full(); })).rejects.toThrow();
    expect(kinds).toEqual(['storage-full']);
    await runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => repositories.metadata.put(note));
    await runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => repositories.metadata.put(note));
    expect(kinds).toEqual(['storage-full', null]);
  });

  it('a write to a closed database reports "closed"', async () => {
    const db = await database();
    const kinds = heard();
    db.close();
    await expect(runKairosAtomicWrite(db, ['metadata'], ({ repositories }) => repositories.metadata.put(note))).rejects.toThrow();
    expect(kinds).toEqual(['closed']);
  });

  it('a full phone shows the banner\'s note, and "Download what can be read" downloads a backup', async () => {
    const db = await database();
    const downloaded: string[] = [];
    const downloads: BackupDownloadPorts = { createObjectUrl: () => 'blob:kairos/1', revokeObjectUrl: () => undefined, triggerDownload: (_url, name) => { downloaded.push(name); } };
    render(<main><h1>Page</h1><DatabaseStatusBanner port={{
      subscribe: listener => { listener({ state: 'ready' }); return () => undefined; },
      reopen: async () => ({ state: 'ready' }),
      subscribeWriteFailures: subscribeKairosWriteFailures,
      downloadReadable: () => runBackup(db, createBackupDelivery({ downloads }), { now: () => '2026-10-23T10:00:00.000Z' }),
      reload: vi.fn(),
    }} /></main>);
    await expect(runKairosAtomicWrite(db, ['metadata'], async () => { throw new Dexie.AbortError('Transaction aborted', full()); })).rejects.toThrow();
    expect(await screen.findByRole('alert')).toHaveTextContent("Your phone's storage is full, so Kairos could not save. Free some space, then try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Download what can be read' }));
    // The download's own note of the backup saved, so saving works again; the note stays until it is closed.
    expect(await screen.findByText('Downloaded. Kairos can save again.')).toBeInTheDocument();
    expect(downloaded).toEqual(['kairos-backup-2026-10-23T10-00-00Z.json']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
